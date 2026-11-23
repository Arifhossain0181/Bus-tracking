import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface BusMeshOptions {
  busNumber?: string;
  accentColor?: string;
  enableHeadlightBeam?: boolean;
  scale?: number;
  status?: 'live' | 'moving' | 'stopped' | 'stale' | 'offline';
}

/**
 * Creates soft radial drop shadow texture for ground contact.
 * Fallbacks safely if rendered in non-browser/SSR environments.
 */
function createDropShadowTexture(): THREE.CanvasTexture | THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.75)');
    gradient.addColorStop(0.4, 'rgba(15, 23, 42, 0.45)');
    gradient.addColorStop(0.7, 'rgba(15, 23, 42, 0.15)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural side stripe texture reading: "IUBAT — International University"
 * Preserves the exact prototype navy typography (#17315c) on IUBAT yellow (#ffcb18).
 */
function createSideStripeTexture(inverted: boolean = false): THREE.CanvasTexture | THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffcb18';
    ctx.fillRect(0, 0, 1024, 128);

    ctx.save();
    if (inverted) {
      // Invert text horizontally if mapping to mirrored side
      ctx.translate(1024, 0);
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = '#17315c';
    ctx.font = '900 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('IUBAT — International University', 512, 64);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Front destination sign: Glowing teal "IUBAT" (#00c4a3) matching the user prototype.
 */
function createDestinationSignTexture(text: string = 'IUBAT'): THREE.CanvasTexture | THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0b1722';
    ctx.fillRect(0, 0, 512, 128);

    // Subtle dark border
    ctx.strokeStyle = '#102c39';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);

    // Glowing Teal Text
    ctx.fillStyle = '#00c4a3';
    ctx.font = '900 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00c4a3';
    ctx.shadowBlur = 12;
    ctx.fillText(text || 'IUBAT', 256, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates dynamic floating bus number badge texture.
 * Only shown when a dynamic bus number is assigned.
 */
function createBusBadgeTexture(busNumber: string): THREE.CanvasTexture | THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 160);

    // Rounded Pill
    const rx = 36;
    const ry = 16;
    const rw = 440;
    const rh = 128;
    const radius = 64;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + rw - radius, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
    ctx.lineTo(rx + rw, ry + rh - radius);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
    ctx.lineTo(rx + radius, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.closePath();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fill();

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Bus Number Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(busNumber, 256, 80);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Updates the floating dynamic bus number badge on an existing bus group.
 */
export function updateBusNumber(busGroup: THREE.Group, busNumber?: string): void {
  const existingBadge = busGroup.getObjectByName('bus_number_badge');
  if (!busNumber) {
    if (existingBadge) existingBadge.visible = false;
    return;
  }

  if (existingBadge && existingBadge instanceof THREE.Mesh) {
    const mat = existingBadge.material as THREE.MeshBasicMaterial;
    mat.map = createBusBadgeTexture(busNumber) as THREE.Texture;
    mat.needsUpdate = true;
    existingBadge.visible = true;
  }
}

/**
 * Creates high-fidelity 3D IUBAT Bus Model matching the user's manual adjustments.
 * Proportions:
 * - Length: 11.2m (Prototype width 620px)
 * - Width: 2.50m (Prototype depth 124px, 5:1 ratio)
 * - Height: 3.25m (Prototype height 205px body + roof)
 * - Pivot: Centered at (0, 0, 0) on the road surface directly underneath the chassis center.
 * - Orientation: Forward direction facing +Y (North at heading 0°).
 */
export function createIubatBusModel(options: BusMeshOptions = {}): THREE.Group {
  const {
    busNumber,
    enableHeadlightBeam = false,
  } = options;

  const busGroup = new THREE.Group();
  busGroup.name = busNumber ? `bus_${busNumber}` : 'iubat_bus_model';

  // =========================================================================
  // 1. Materials — Faithful translation of user prototype color scheme
  // =========================================================================

  // Signature IUBAT Golden Yellow (#ffcb18, #ffdc43, #e8ad00)
  const mainYellowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcb18,
    roughness: 0.28,
    metalness: 0.12,
  });

  const upperYellowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdc43,
    roughness: 0.30,
    metalness: 0.10,
  });

  const lowerSkirtMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8ad00,
    roughness: 0.38,
    metalness: 0.15,
  });

  const goldenBorderMaterial = new THREE.MeshStandardMaterial({
    color: 0xb58a0c,
    roughness: 0.40,
    metalness: 0.25,
  });

  // Roof Golden Gradient (#ffe86a / #ffd12a)
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd12a,
    roughness: 0.32,
    metalness: 0.10,
  });

  // Window Frames: Golden Trim (#f5c91c)
  const windowFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5c91c,
    roughness: 0.25,
    metalness: 0.20,
  });

  // Tinted Glass Panes: Deep dark blue / cyan tint (#142533 / #0e1c28)
  const tintedGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0x142533,
    roughness: 0.08,
    metalness: 0.88,
    transparent: true,
    opacity: 0.92,
  });

  // Dark Mechanical Undercarriage (#14171b)
  const undercarriageMaterial = new THREE.MeshStandardMaterial({
    color: 0x14171b,
    roughness: 0.70,
    metalness: 0.20,
  });

  // Bumpers: Gray (#68717a)
  const bumperMaterial = new THREE.MeshStandardMaterial({
    color: 0x68717a,
    roughness: 0.45,
    metalness: 0.40,
  });

  // Headlights: Warm xenon white (#f4f0ce) with emissive glow
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f0ce,
    emissive: 0xfff8d0,
    emissiveIntensity: 2.8,
    roughness: 0.10,
  });

  // Taillights: Red LED brake lights (#d82d20) with emissive glow
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xd82d20,
    emissive: 0xef4444,
    emissiveIntensity: 3.2,
    roughness: 0.10,
  });

  // Wheels: Black rubber tire (#171b20) and silver rim hubcaps (#aab2b7)
  const wheelTireMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b20,
    roughness: 0.85,
    metalness: 0.10,
  });

  const wheelRimMaterial = new THREE.MeshStandardMaterial({
    color: 0xaab2b7,
    roughness: 0.25,
    metalness: 0.85,
  });

  // =========================================================================
  // 2. Ground Contact Shadow Plane (z = 0.02)
  // =========================================================================
  const shadowGeo = new THREE.PlaneGeometry(2.7, 11.6);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: createDropShadowTexture() as THREE.Texture,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0, 0.02);
  busGroup.add(shadowMesh);

  // =========================================================================
  // 3. Undercarriage & Mechanical Sub-Chassis (z = 0.45 to 0.75)
  // =========================================================================
  const undercarriageGeo = new THREE.BoxGeometry(2.35, 10.6, 0.30);
  const undercarriageMesh = new THREE.Mesh(undercarriageGeo, undercarriageMaterial);
  undercarriageMesh.position.set(0, 0, 0.60);
  busGroup.add(undercarriageMesh);

  // =========================================================================
  // 4. Lower Body / Skirt (#e8ad00, z = 0.50 to 1.30, height = 0.80)
  // =========================================================================
  const lowerBodyGeo = new THREE.BoxGeometry(2.50, 11.20, 0.80);
  const lowerBodyMesh = new THREE.Mesh(lowerBodyGeo, lowerSkirtMaterial);
  lowerBodyMesh.position.set(0, 0, 0.50 + 0.40); // center z = 0.90
  busGroup.add(lowerBodyMesh);

  // Bottom Skirt Golden Accent Border (#b58a0c)
  const skirtBorderGeo = new THREE.BoxGeometry(2.52, 11.22, 0.08);
  const skirtBorderMesh = new THREE.Mesh(skirtBorderGeo, goldenBorderMaterial);
  skirtBorderMesh.position.set(0, 0, 0.54);
  busGroup.add(skirtBorderMesh);

  // =========================================================================
  // 5. Main Mid Body & Side Decal Ribbon (z = 1.30 to 1.65, height = 0.35)
  // =========================================================================
  const midBodyGeo = new THREE.BoxGeometry(2.48, 11.18, 0.35);
  const midBodyMesh = new THREE.Mesh(midBodyGeo, mainYellowMaterial);
  midBodyMesh.position.set(0, 0, 1.30 + 0.35 / 2); // center z = 1.475
  busGroup.add(midBodyMesh);

  // Side Decal Ribbon: "IUBAT — International University" on left & right sides
  const stripeGeo = new THREE.PlaneGeometry(9.6, 0.28);
  stripeGeo.rotateX(Math.PI / 2); // local Y goes to Z (height = 0.28)
  stripeGeo.rotateZ(Math.PI / 2); // local X goes to Y (length = 9.6)

  const leftStripeMat = new THREE.MeshBasicMaterial({
    map: createSideStripeTexture(false) as THREE.Texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const leftStripe = new THREE.Mesh(stripeGeo, leftStripeMat);
  leftStripe.position.set(-1.255, 0, 1.48);
  busGroup.add(leftStripe);

  const rightStripeMat = new THREE.MeshBasicMaterial({
    map: createSideStripeTexture(true) as THREE.Texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const rightStripe = new THREE.Mesh(stripeGeo, rightStripeMat);
  rightStripe.position.set(1.255, 0, 1.48);
  busGroup.add(rightStripe);

  // =========================================================================
  // 6. Side Windows — Exactly 7 distinct passenger windows per side (#f5c91c trim)
  // =========================================================================
  // Central glass core (width = 2.44, length = 10.8, height = 1.05, center z = 2.175)
  const glassCoreGeo = new THREE.BoxGeometry(2.44, 10.80, 1.05);
  const glassCoreMesh = new THREE.Mesh(glassCoreGeo, tintedGlassMaterial);
  glassCoreMesh.position.set(0, 0, 1.65 + 1.05 / 2);
  busGroup.add(glassCoreMesh);

  // 7 Distinct Window Mullions / Frames per side matching prototype (.windows flex 7 .window)
  // Placed symmetrically along Y from -3.8m to +3.4m
  const windowCount = 7;
  const windowSpanY = 7.2; // total length of window area
  const windowStartY = -3.6;
  const stepY = windowSpanY / (windowCount - 1);

  for (let i = 0; i < windowCount; i++) {
    const wy = windowStartY + i * stepY;

    // Window vertical pillar separator on both sides
    [-1.252, 1.252].forEach((wx) => {
      const pillarGeo = new THREE.BoxGeometry(0.04, 0.12, 1.06);
      const pillarMesh = new THREE.Mesh(pillarGeo, windowFrameMaterial);
      pillarMesh.position.set(wx, wy, 2.175);
      busGroup.add(pillarMesh);
    });
  }

  // Horizontal window frame lines (top and bottom border of window band)
  [-1.252, 1.252].forEach((wx) => {
    // Bottom golden frame
    const bottomFrameGeo = new THREE.BoxGeometry(0.03, 10.80, 0.06);
    const bottomFrameMesh = new THREE.Mesh(bottomFrameGeo, windowFrameMaterial);
    bottomFrameMesh.position.set(wx, 0, 1.65);
    busGroup.add(bottomFrameMesh);

    // Top golden frame
    const topFrameGeo = new THREE.BoxGeometry(0.03, 10.80, 0.06);
    const topFrameMesh = new THREE.Mesh(topFrameGeo, windowFrameMaterial);
    topFrameMesh.position.set(wx, 0, 2.70);
    busGroup.add(topFrameMesh);
  });

  // Passenger Entry Door (near front-left passenger side at y = +4.40)
  const doorGeo = new THREE.BoxGeometry(0.05, 0.90, 1.85);
  const doorMesh = new THREE.Mesh(doorGeo, windowFrameMaterial);
  doorMesh.position.set(-1.255, 4.40, 1.60);
  busGroup.add(doorMesh);

  // Door split glass panels (top and bottom panes matching prototype)
  [2.15, 1.15].forEach((dz) => {
    const doorGlassGeo = new THREE.BoxGeometry(0.06, 0.74, 0.68);
    const doorGlassMesh = new THREE.Mesh(doorGlassGeo, tintedGlassMaterial);
    doorGlassMesh.position.set(-1.256, 4.40, dz);
    busGroup.add(doorGlassMesh);
  });

  // =========================================================================
  // 7. Upper Body Section & Roof Base (#ffdc43, z = 2.70 to 2.90)
  // =========================================================================
  const upperBodyGeo = new THREE.BoxGeometry(2.50, 11.20, 0.20);
  const upperBodyMesh = new THREE.Mesh(upperBodyGeo, upperYellowMaterial);
  upperBodyMesh.position.set(0, 0, 2.80);
  busGroup.add(upperBodyMesh);

  // =========================================================================
  // 8. Curved Aerodynamic Roof Cap (#ffd12a, z = 2.90 to 3.25)
  // Seamlessly rounded connection matching prototype .roof
  // =========================================================================
  const roofGeo = new THREE.BoxGeometry(2.46, 11.16, 0.32);
  const roofMesh = new THREE.Mesh(roofGeo, roofMaterial);
  roofMesh.position.set(0, 0, 2.90 + 0.32 / 2); // center z = 3.06
  busGroup.add(roofMesh);

  // Aerodynamic roof crown strip
  const roofCrownGeo = new THREE.BoxGeometry(2.20, 10.80, 0.08);
  const roofCrownMesh = new THREE.Mesh(roofCrownGeo, goldenBorderMaterial);
  roofCrownMesh.position.set(0, 0, 3.22);
  busGroup.add(roofCrownMesh);

  // =========================================================================
  // 9. Front Face (Facing +Y = +5.60m)
  // Windshield, Teal "IUBAT" Destination Sign, Headlights & Bumper
  // =========================================================================
  // Front Aerodynamic Windshield Glass (#243e53 / #1b2d3d)
  const windshieldGeo = new THREE.PlaneGeometry(2.28, 1.05);
  const windshieldMesh = new THREE.Mesh(windshieldGeo, tintedGlassMaterial);
  windshieldMesh.rotation.x = Math.PI / 2 + 0.08; // slightly aerodynamic rake
  windshieldMesh.position.set(0, 5.61, 2.15);
  busGroup.add(windshieldMesh);

  // Windshield Frame Trim (#f4c51b)
  const windshieldFrameGeo = new THREE.BoxGeometry(2.32, 0.04, 1.08);
  const windshieldFrame = new THREE.Mesh(windshieldFrameGeo, windowFrameMaterial);
  windshieldFrame.position.set(0, 5.59, 2.15);
  busGroup.add(windshieldFrame);

  // Front Destination Sign: Glowing Teal "IUBAT" (#00c4a3)
  const destSignGeo = new THREE.PlaneGeometry(1.60, 0.32);
  const destSignMat = new THREE.MeshBasicMaterial({
    map: createDestinationSignTexture('IUBAT') as THREE.Texture,
  });
  const destSignMesh = new THREE.Mesh(destSignGeo, destSignMat);
  destSignMesh.rotation.x = Math.PI / 2;
  destSignMesh.position.set(0, 5.61, 2.76);
  busGroup.add(destSignMesh);

  // Twin Front Headlights (Warm white #f4f0ce, bottom z = 0.88, y = +5.62)
  [-0.88, 0.88].forEach((hx) => {
    const hlGeo = new THREE.BoxGeometry(0.36, 0.08, 0.24);
    const hlMesh = new THREE.Mesh(hlGeo, headlightMaterial);
    hlMesh.position.set(hx, 5.62, 0.88);
    busGroup.add(hlMesh);

    // Chrome headlight housing
    const housingGeo = new THREE.BoxGeometry(0.40, 0.04, 0.28);
    const housingMesh = new THREE.Mesh(housingGeo, bumperMaterial);
    housingMesh.position.set(hx, 5.60, 0.88);
    busGroup.add(housingMesh);
  });

  // Front Gray Bumper (#68717a, y = +5.63, z = 0.55)
  const frontBumperGeo = new THREE.BoxGeometry(2.46, 0.16, 0.22);
  const frontBumperMesh = new THREE.Mesh(frontBumperGeo, bumperMaterial);
  frontBumperMesh.position.set(0, 5.63, 0.55);
  busGroup.add(frontBumperMesh);

  // =========================================================================
  // 10. Rear Face (Facing -Y = -5.60m)
  // Rear Window, Dual Red LED Tail Lamps & Rear Bumper
  // =========================================================================
  // Rear Window Glass with golden border
  const rearWindowGeo = new THREE.PlaneGeometry(2.10, 0.85);
  const rearWindowMesh = new THREE.Mesh(rearWindowGeo, tintedGlassMaterial);
  rearWindowMesh.rotation.x = -Math.PI / 2;
  rearWindowMesh.position.set(0, -5.61, 2.18);
  busGroup.add(rearWindowMesh);

  const rearFrameGeo = new THREE.BoxGeometry(2.16, 0.04, 0.90);
  const rearFrameMesh = new THREE.Mesh(rearFrameGeo, windowFrameMaterial);
  rearFrameMesh.position.set(0, -5.59, 2.18);
  busGroup.add(rearFrameMesh);

  // Dual Red LED Tail Lamps (#d82d20, y = -5.62, z = 0.88)
  [-0.88, 0.88].forEach((rx) => {
    const tlGeo = new THREE.BoxGeometry(0.36, 0.08, 0.28);
    const tlMesh = new THREE.Mesh(tlGeo, taillightMaterial);
    tlMesh.position.set(rx, -5.62, 0.88);
    busGroup.add(tlMesh);
  });

  // Rear Gray Bumper (#68717a, y = -5.63, z = 0.55)
  const rearBumperGeo = new THREE.BoxGeometry(2.46, 0.16, 0.22);
  const rearBumperMesh = new THREE.Mesh(rearBumperGeo, bumperMaterial);
  rearBumperMesh.position.set(0, -5.63, 0.55);
  busGroup.add(rearBumperMesh);

  // =========================================================================
  // 11. Wheels & Suspension (4 Wheels: Front y = +3.30, Rear y = -3.10)
  // Bottom of wheels touches z = 0.00 exactly (radius = 0.48, center z = 0.48)
  // =========================================================================
  const wheelAxlePositions = [
    [-1.25, 3.30], // Front-Left
    [1.25, 3.30],  // Front-Right
    [-1.25, -3.10], // Rear-Left
    [1.25, -3.10],  // Rear-Right
  ];

  const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 20);
  const rimGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.34, 16);
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.36, 12);

  wheelAxlePositions.forEach(([x, y]) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, 0.48); // wheel center at z = 0.48m
    wheelGroup.rotation.z = Math.PI / 2; // Orient along vehicle axis

    const tireMesh = new THREE.Mesh(tireGeo, wheelTireMaterial);
    const rimMesh = new THREE.Mesh(rimGeo, wheelRimMaterial);
    const hubMesh = new THREE.Mesh(hubGeo, goldenBorderMaterial);

    wheelGroup.add(tireMesh);
    wheelGroup.add(rimMesh);
    wheelGroup.add(hubMesh);
    busGroup.add(wheelGroup);
  });

  // =========================================================================
  // 12. Optional Subtle Headlight Beam (Default disabled for mobile performance)
  // =========================================================================
  if (enableHeadlightBeam) {
    const beamGeo = new THREE.ConeGeometry(1.2, 8, 16);
    beamGeo.rotateX(-Math.PI / 2); // Point forward along +Y
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff8d0,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 5.6 + 4.0, 0.7);
    busGroup.add(beamMesh);
  }

  // =========================================================================
  // 13. Dynamic Bus Number Badge (Floating above roof at z = 3.65m)
  // Only displayed dynamically when busNumber is present.
  // =========================================================================
  if (busNumber) {
    const badgeGeo = new THREE.PlaneGeometry(1.8, 0.56);
    const badgeMat = new THREE.MeshBasicMaterial({
      map: createBusBadgeTexture(busNumber) as THREE.Texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
    badgeMesh.name = 'bus_number_badge';
    badgeMesh.rotation.x = Math.PI / 2; // Face forward/backward
    badgeMesh.position.set(0, 0, 3.65);
    busGroup.add(badgeMesh);
  }

  return busGroup;
}

/**
 * Standard alias for backwards compatibility with existing layer imports.
 */
export function createProceduralBus(options: BusMeshOptions = {}): THREE.Group {
  return createIubatBusModel(options);
}

/**
 * Loads an external model if available, otherwise cleanly creates the custom IUBAT bus model.
 */
export async function loadBusModel(
  url?: string | null,
  options: BusMeshOptions = {}
): Promise<THREE.Group> {
  if (!url) {
    return createIubatBusModel(options);
  }

  const loader = new GLTFLoader();
  try {
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });

    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
      const targetScale = 11.2 / maxDim;
      model.scale.set(targetScale, targetScale, targetScale);
    }

    const shadowGeo = new THREE.PlaneGeometry(3.8, 12.8);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createDropShadowTexture() as THREE.Texture,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0, 0.02);

    const rootGroup = new THREE.Group();
    rootGroup.add(shadowMesh);
    rootGroup.add(model);
    return rootGroup;
  } catch {
    return createIubatBusModel(options);
  }
}
