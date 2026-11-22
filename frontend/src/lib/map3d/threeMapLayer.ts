import * as THREE from 'three';
import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import { createProceduralBus, loadBusModel } from './busMesh';

export interface ActiveBusData {
  id: number;
  busNumber: string;
  routeName?: string;
  driverName?: string;
  speed?: number | null;
  heading?: number | null;
  latitude: number;
  longitude: number;
  lastUpdated?: string;
  accentColor?: string;
  status?: 'moving' | 'stopped' | 'offline';
  licensePlate?: string;
}

interface BusRuntimeState {
  data: ActiveBusData;
  group: THREE.Group;
  currentLng: number;
  currentLat: number;
  targetLng: number;
  targetLat: number;
  currentHeading: number;
  targetHeading: number;
}

export class ThreeMap3DLayer implements CustomLayerInterface {
  id: string;
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  private busesMap: Map<number, BusRuntimeState> = new Map();
  private followingBusId: number | null = null;
  private glbModelUrl: string | null = '/models/bus.glb';
  private customScale: number = 1.25; // 1.25x miniature scale for isometric readability
  private sunLight: THREE.DirectionalLight | null = null;
  private skyLight: THREE.DirectionalLight | null = null;

  constructor(id: string = 'three-3d-buses-layer') {
    this.id = id;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    // 1. Scene & Lighting for isometric architectural view
    this.scene = new THREE.Scene();

    // Warm directional sunlight casting crisp architectural shadows
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sunLight.position.set(120, -180, 250);
    this.scene.add(this.sunLight);

    // Sky ambient fill light with subtle cyan/blue hue
    this.skyLight = new THREE.DirectionalLight(0xbbe8fd, 0.7);
    this.skyLight.position.set(-100, 150, 180);
    this.scene.add(this.skyLight);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    // Ground bounce light
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.5);
    this.scene.add(hemiLight);

    // 2. WebGL Renderer sharing the MapLibre canvas
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
    }

    // 3. Re-attach any existing buses to the scene (handles style switches cleanly)
    for (const state of this.busesMap.values()) {
      if (state.group && !this.scene.children.includes(state.group)) {
        this.scene.add(state.group);
      }
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.map || !this.renderer) return;

    const rawMatrix = (options.modelViewProjectionMatrix || options) as unknown as number[];
    const center = this.map.getCenter();
    const centerMerc = MercatorCoordinate.fromLngLat([center.lng, center.lat], 0);
    const meterScale = centerMerc.meterInMercatorCoordinateUnits();

    // Transformation matrix: translate to centerMerc, scale meters to Mercator units
    const centerMatrix = new THREE.Matrix4()
      .makeTranslation(centerMerc.x, centerMerc.y, centerMerc.z)
      .scale(new THREE.Vector3(meterScale, -meterScale, meterScale));

    // Combine map projection matrix with centerMatrix
    const mapMatrix = new THREE.Matrix4().fromArray(rawMatrix);
    this.camera.projectionMatrix = mapMatrix.multiply(centerMatrix);

    // Update each bus position with smooth interpolation (lerp)
    const LERP_FACTOR = 0.08;
    for (const [id, state] of this.busesMap.entries()) {
      state.currentLng += (state.targetLng - state.currentLng) * LERP_FACTOR;
      state.currentLat += (state.targetLat - state.currentLat) * LERP_FACTOR;

      // Smooth heading angle interpolation
      let angleDiff = state.targetHeading - state.currentHeading;
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;
      state.currentHeading += angleDiff * LERP_FACTOR;

      // Project current position relative to map center in meters
      const busMerc = MercatorCoordinate.fromLngLat([state.currentLng, state.currentLat], 0);
      const dxMeters = (busMerc.x - centerMerc.x) / meterScale;
      const dyMeters = -(busMerc.y - centerMerc.y) / meterScale;

      state.group.position.set(dxMeters, dyMeters, 0);
      state.group.rotation.z = -THREE.MathUtils.degToRad(state.currentHeading);
      state.group.scale.set(this.customScale, this.customScale, this.customScale);

      // Follow camera lock
      if (this.followingBusId === id && this.map) {
        this.map.jumpTo({
          center: [state.currentLng, state.currentLat],
        });
      }
    }

    // Reset Three.js WebGL state cache and render scene
    const renderer = this.renderer as unknown as {
      resetState?: () => void;
      state?: { reset?: () => void };
      render: (scene: THREE.Scene, camera: THREE.Camera) => void;
    };

    if (typeof renderer.resetState === 'function') {
      renderer.resetState();
    } else if (typeof renderer.state?.reset === 'function') {
      renderer.state.reset();
    }

    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  /**
   * Sync active buses list from backend API
   */
  async updateBuses(busList: ActiveBusData[]): Promise<void> {
    const currentIds = new Set(busList.map((b) => b.id));

    // Remove inactive buses
    for (const [id, state] of this.busesMap.entries()) {
      if (!currentIds.has(id)) {
        this.scene.remove(state.group);
        this.busesMap.delete(id);
      }
    }

    // Add or update active buses
    for (const data of busList) {
      const existing = this.busesMap.get(data.id);

      if (existing) {
        // Calculate heading if not provided
        let newHeading = data.heading;
        if (newHeading == null || isNaN(newHeading)) {
          const dLng = data.longitude - existing.targetLng;
          const dLat = data.latitude - existing.targetLat;
          if (Math.hypot(dLng, dLat) > 0.00002) {
            newHeading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
            if (newHeading < 0) newHeading += 360;
          } else {
            newHeading = existing.targetHeading;
          }
        }

        existing.targetLng = data.longitude;
        existing.targetLat = data.latitude;
        existing.targetHeading = newHeading;
        existing.data = data;
      } else {
        // Create new 3D Bus
        let busGroup: THREE.Group;
        try {
          if (this.glbModelUrl) {
            busGroup = await loadBusModel(this.glbModelUrl, {
              busNumber: data.busNumber,
              accentColor: data.accentColor || '#0ea5e9',
            });
          } else {
            busGroup = createProceduralBus({
              busNumber: data.busNumber,
              accentColor: data.accentColor || '#0ea5e9',
            });
          }
        } catch {
          busGroup = createProceduralBus({
            busNumber: data.busNumber,
            accentColor: data.accentColor || '#0ea5e9',
          });
        }

        this.scene.add(busGroup);

        const initialHeading = data.heading || 0;
        this.busesMap.set(data.id, {
          data,
          group: busGroup,
          currentLng: data.longitude,
          currentLat: data.latitude,
          targetLng: data.longitude,
          targetLat: data.latitude,
          currentHeading: initialHeading,
          targetHeading: initialHeading,
        });
      }
    }

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  setLighting(preset: 'day' | 'dusk' | 'night'): void {
    if (!this.sunLight || !this.skyLight) return;
    if (preset === 'day') {
      this.sunLight.color.setHex(0xffffff);
      this.sunLight.intensity = 1.5;
      this.sunLight.position.set(120, -180, 250);
      this.skyLight.color.setHex(0xbbe8fd);
    } else if (preset === 'dusk') {
      this.sunLight.color.setHex(0xfb923c); // Warm dusk sun
      this.sunLight.intensity = 1.9;
      this.sunLight.position.set(220, -80, 110); // Lower sun angle
      this.skyLight.color.setHex(0xf472b6);
    } else if (preset === 'night') {
      this.sunLight.color.setHex(0x38bdf8); // Moonlight
      this.sunLight.intensity = 0.45;
      this.sunLight.position.set(50, -50, 200);
      this.skyLight.color.setHex(0x1e1b4b);
    }
    if (this.map) this.map.triggerRepaint();
  }

  setFollowingBusId(busId: number | null): void {
    this.followingBusId = busId;
    if (this.map && busId != null) {
      const state = this.busesMap.get(busId);
      if (state) {
        this.map.easeTo({
          center: [state.currentLng, state.currentLat],
          pitch: 60,
          zoom: 16.5,
          duration: 1200,
        });
      }
    }
  }

  focusBus(busId: number): void {
    const state = this.busesMap.get(busId);
    if (state && this.map) {
      this.map.flyTo({
        center: [state.currentLng, state.currentLat],
        zoom: 16.8,
        pitch: 60,
        bearing: state.currentHeading || -20,
        duration: 1600,
      });
    }
  }

  onRemove(): void {
    for (const state of this.busesMap.values()) {
      this.scene.remove(state.group);
    }
  }

  destroy(): void {
    this.onRemove();
    this.busesMap.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }
}
