import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface BusMeshOptions {
  busNumber?: string;
  accentColor?: string;
  enableHeadlightBeam?: boolean;
  scale?: number;
}

// Generate a soft radial drop shadow texture for ground contact
function createDropShadowTexture(): THREE.CanvasTexture {
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

// Generate canvas texture for destination LED board above windshield
function createDestinationSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || 'CAMPUS EXPRESS', 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a high-fidelity procedural 3D Miniature Bus
 * Proportions in meters: Length: 11.2m, Width: 2.7m, Height: 3.2m
 */
export function createProceduralBus(options: BusMeshOptions = {}): THREE.Group {
  const {
    busNumber = 'BUS #12',
    accentColor = '#0ea5e9',
    enableHeadlightBeam = true,
  } = options;

  const busGroup = new THREE.Group();
  busGroup.name = `bus_${busNumber}`;

  // Shared materials
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.15,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentColor),
    roughness: 0.3,
    metalness: 0.2,
  });

  const darkTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.2,
  });

  const tintedGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.08,
    metalness: 0.9,
    transparent: true,
    opacity: 0.92,
  });

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x38bdf8,
    emissiveIntensity: 3.5,
    roughness: 0.1,
  });

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3b30,
    emissive: 0xef4444,
    emissiveIntensity: 3.5,
    roughness: 0.1,
  });

  const wheelRubberMaterial = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.85,
    metalness: 0.1,
  });

  const wheelRimMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.2,
    metalness: 0.85,
  });

  // 1. Contact Drop Shadow Plane on the road
  const shadowGeo = new THREE.PlaneGeometry(4.2, 13.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: createDropShadowTexture(),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0, 0.05); // slightly above ground
  busGroup.add(shadowMesh);

  // 2. Main Lower Chassis (Width: 2.7, Length: 11.0, Height: 1.1)
  const chassisGeo = new THREE.BoxGeometry(2.7, 11.0, 1.1);
  const chassisMesh = new THREE.Mesh(chassisGeo, bodyMaterial);
  chassisMesh.position.set(0, 0, 1.1 / 2 + 0.4); // 0.4m wheel ground clearance
  busGroup.add(chassisMesh);

  // Accent stripe along side
  const stripeGeo = new THREE.BoxGeometry(2.74, 10.9, 0.22);
  const stripeMesh = new THREE.Mesh(stripeGeo, accentMaterial);
  stripeMesh.position.set(0, 0, 0.95);
  busGroup.add(stripeMesh);

  // 3. Middle Window Band (Tinted Glass Ribbon)
  const windowGeo = new THREE.BoxGeometry(2.66, 10.7, 1.15);
  const windowMesh = new THREE.Mesh(windowGeo, tintedGlassMaterial);
  windowMesh.position.set(0, 0, 1.1 + 0.4 + 1.15 / 2);
  busGroup.add(windowMesh);

  // Vertical window pillars
  for (let y = -4.5; y <= 4.5; y += 1.8) {
    const pillarGeo = new THREE.BoxGeometry(2.72, 0.12, 1.16);
    const pillarMesh = new THREE.Mesh(pillarGeo, darkTrimMaterial);
    pillarMesh.position.set(0, y, 1.1 + 0.4 + 1.15 / 2);
    busGroup.add(pillarMesh);
  }

  // 4. Upper Roof Cap
  const roofGeo = new THREE.BoxGeometry(2.7, 11.0, 0.4);
  const roofMesh = new THREE.Mesh(roofGeo, bodyMaterial);
  roofMesh.position.set(0, 0, 1.1 + 0.4 + 1.15 + 0.2);
  busGroup.add(roofMesh);

  // 5. Rooftop AC units (2 aerodynamic pods)
  [-1.8, 1.8].forEach((offsetY) => {
    const acGeo = new THREE.BoxGeometry(1.8, 2.2, 0.35);
    const acMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.4,
      metalness: 0.3,
    });
    const acMesh = new THREE.Mesh(acGeo, acMat);
    acMesh.position.set(0, offsetY, 1.1 + 0.4 + 1.15 + 0.4 + 0.18);
    busGroup.add(acMesh);

    // AC grill lines
    const grillGeo = new THREE.BoxGeometry(1.5, 1.6, 0.08);
    const grillMesh = new THREE.Mesh(grillGeo, darkTrimMaterial);
    grillMesh.position.set(0, offsetY, 1.1 + 0.4 + 1.15 + 0.4 + 0.36);
    busGroup.add(grillMesh);
  });

  // 6. Front Curved Windshield & Destination Sign
  // Facing +Y (forward direction)
  const destGeo = new THREE.PlaneGeometry(1.8, 0.45);
  const destMat = new THREE.MeshBasicMaterial({
    map: createDestinationSignTexture(busNumber),
  });
  const destMesh = new THREE.Mesh(destGeo, destMat);
  destMesh.rotation.x = Math.PI / 2;
  destMesh.position.set(0, 5.51, 1.1 + 0.4 + 0.95);
  busGroup.add(destMesh);

  // 7. Twin Xenon LED Headlights (Front: +Y = 5.51)
  [-0.95, 0.95].forEach((x) => {
    const hlGeo = new THREE.BoxGeometry(0.42, 0.08, 0.22);
    const hlMesh = new THREE.Mesh(hlGeo, headlightMaterial);
    hlMesh.position.set(x, 5.52, 0.85);
    busGroup.add(hlMesh);
  });

  // 8. Dual Red LED Taillights (Rear: -Y = -5.51)
  [-0.95, 0.95].forEach((x) => {
    const tlGeo = new THREE.BoxGeometry(0.45, 0.08, 0.22);
    const tlMesh = new THREE.Mesh(tlGeo, taillightMaterial);
    tlMesh.position.set(x, -5.52, 0.85);
    busGroup.add(tlMesh);
  });

  // 9. Wheels & Rims (4 wheels)
  const wheelPositions = [
    [-1.35, 3.6], // Front Left
    [1.35, 3.6],  // Front Right
    [-1.35, -3.6], // Rear Left
    [1.35, -3.6],  // Rear Right
  ];

  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 18);
  const rimGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.37, 12);

  wheelPositions.forEach(([x, y]) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, 0.5);
    wheelGroup.rotation.z = Math.PI / 2;

    const tireMesh = new THREE.Mesh(wheelGeo, wheelRubberMaterial);
    const rimMesh = new THREE.Mesh(rimGeo, wheelRimMaterial);

    wheelGroup.add(tireMesh);
    wheelGroup.add(rimMesh);
    busGroup.add(wheelGroup);
  });

  // 10. Headlight Beam Cone illuminating the road
  if (enableHeadlightBeam) {
    const beamGeo = new THREE.ConeGeometry(2.5, 14, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    // Rotate cone to lie horizontally pointing forward (+Y)
    beamMesh.rotation.x = Math.PI / 2;
    beamMesh.position.set(0, 5.5 + 7, 0.3);
    busGroup.add(beamMesh);
  }

  return busGroup;
}

/**
 * Attempts to load an external GLB bus model.
 * If not found or fails, falls back gracefully to the high-detail procedural model.
 */
export async function loadBusModel(
  url: string = '/models/bus.glb',
  options: BusMeshOptions = {}
): Promise<THREE.Group> {
  const loader = new GLTFLoader();

  try {
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });

    const model = gltf.scene;
    // Auto-normalize scale and orientation
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
      // Scale to approx 11 meters
      const targetScale = 11.0 / maxDim;
      model.scale.set(targetScale, targetScale, targetScale);
    }

    // Attach ground shadow
    const shadowGeo = new THREE.PlaneGeometry(4.2, 13.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createDropShadowTexture(),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0, 0.05);

    const rootGroup = new THREE.Group();
    rootGroup.add(shadowMesh);
    rootGroup.add(model);
    return rootGroup;
  } catch {
    // Graceful fallback to procedural 3D bus
    return createProceduralBus(options);
  }
}
