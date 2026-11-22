/**
 * MapLibre GL JS Utilities and Helper Functions for UBus Experimental Evaluation.
 */

export interface MapCoordinates {
  lat: number;
  lng: number;
}

export interface SimulatedBusState {
  lat: number;
  lng: number;
  heading: number;
  speed: number; // m/s
  busNumber: string;
}

export interface CameraPreset {
  id: string;
  label: string;
  description: string;
  pitch: number;
  bearing: number;
  zoom: number;
}

/**
 * Converts Leaflet [lat, lng] to MapLibre GeoJSON [lng, lat].
 */
export function leafletToMapLibreCoords(coords: [number, number]): [number, number] {
  return [coords[1], coords[0]];
}

/**
 * Converts MapLibre GeoJSON [lng, lat] to Leaflet [lat, lng].
 */
export function mapLibreToLeafletCoords(coords: [number, number]): [number, number] {
  return [coords[1], coords[0]];
}

/**
 * Normalizes an angle into [0, 360) range.
 */
export function normalizeBearing(angle: number): number {
  const mod = angle % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Calculates bearing in degrees between two coordinates [lat1, lng1] and [lat2, lng2].
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeBearing(brng);
}

/**
 * Predefined campus waypoints representing a circular university shuttle route
 * around university campus / Kuril / Baridhara / Gulshan area.
 * Format: [latitude, longitude]
 */
export const MOCK_CAMPUS_ROUTE: [number, number][] = [
  [23.8155, 90.4125], // Campus Main Gate
  [23.8172, 90.4150], // Academic Building 1
  [23.8190, 90.4185], // Science Complex & Library
  [23.8215, 90.4220], // North Campus Plaza
  [23.8240, 90.4265], // Student Residential Halls
  [23.8228, 90.4310], // Sports Complex & Stadium
  [23.8185, 90.4325], // East Campus Gate
  [23.8140, 90.4285], // Medical Center & Faculty Quarters
  [23.8120, 90.4225], // South Terminal & Transit Hub
  [23.8135, 90.4160], // Administration Building
  [23.8155, 90.4125], // Back to Main Gate (Loop)
];

/**
 * Interpolates vehicle position, heading, and speed along a waypoints loop based on normalized progress [0, 1].
 */
export function interpolatePositionOnRoute(
  waypoints: [number, number][],
  progress: number
): { lat: number; lng: number; heading: number; speed: number } {
  if (!waypoints || waypoints.length === 0) {
    return { lat: 23.8103, lng: 90.4125, heading: 0, speed: 0 };
  }
  if (waypoints.length === 1) {
    return { lat: waypoints[0][0], lng: waypoints[0][1], heading: 0, speed: 0 };
  }

  // Clamped/wrapped progress
  const normalized = ((progress % 1) + 1) % 1;
  const numSegments = waypoints.length - 1;
  const segmentIndex = Math.min(Math.floor(normalized * numSegments), numSegments - 1);
  const segmentFraction = normalized * numSegments - segmentIndex;

  const p1 = waypoints[segmentIndex];
  const p2 = waypoints[segmentIndex + 1];

  const lat = p1[0] + (p2[0] - p1[0]) * segmentFraction;
  const lng = p1[1] + (p2[1] - p1[1]) * segmentFraction;
  const heading = calculateBearing(p1[0], p1[1], p2[0], p2[1]);

  // Simulated speed between 25-45 km/h (7-12 m/s) with slight curves
  const speed = 8.5 + 2.5 * Math.sin(normalized * Math.PI * 4);

  return { lat, lng, heading, speed };
}

/**
 * Map style choices available for MapLibre prototype.
 */
export const MAP_STYLES = [
  {
    id: 'openfreemap-liberty',
    name: 'OpenFreeMap Liberty (Vector + 3D)',
    description: 'Free open-source vector tiles supporting 3D extruded buildings (no API key)',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    supports3DBuildings: true,
  },
  {
    id: 'openfreemap-bright',
    name: 'OpenFreeMap Bright (Vector)',
    description: 'High-contrast vector map with street-level detail',
    url: 'https://tiles.openfreemap.org/styles/bright',
    supports3DBuildings: true,
  },
  {
    id: 'demotiles',
    name: 'MapLibre DemoTiles (Vector)',
    description: 'Official MapLibre demo vector style',
    url: 'https://demotiles.maplibre.org/style.json',
    supports3DBuildings: false,
  },
  {
    id: 'osm-raster',
    name: 'OpenStreetMap Raster (WebGL)',
    description: 'Standard OpenStreetMap tiles rendered via WebGL with pitch & bearing',
    url: 'raster-osm', // Handled via inline style object
    supports3DBuildings: false,
  },
];

/**
 * Predefined camera perspective presets.
 */
export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'top-down-2d',
    label: 'Top-Down 2D',
    description: 'Traditional flat 2D perspective (Pitch: 0°, Bearing: 0°)',
    pitch: 0,
    bearing: 0,
    zoom: 15,
  },
  {
    id: 'chase-3d',
    label: 'Driver Chase 3D',
    description: 'Tilted vehicle-following 3D perspective (Pitch: 60°, Bearing: Auto)',
    pitch: 60,
    bearing: 45,
    zoom: 16.5,
  },
  {
    id: 'isometric-3d',
    label: 'Isometric Bird’s Eye',
    description: 'Campus overview with 45° tilt and 3D building depth (Pitch: 45°)',
    pitch: 45,
    bearing: -30,
    zoom: 15.5,
  },
  {
    id: 'maximum-pitch',
    label: 'Extreme 3D Horizon',
    description: 'Maximum 70° pitch showcasing horizon and vertical extrusions',
    pitch: 70,
    bearing: 30,
    zoom: 16,
  },
];
