import { calculateDistanceMeters } from './trackingStatus.ts';

export interface EditorPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [longitude, latitude] in GeoJSON standard
}

export interface GeometryValidationResult {
  isValid: boolean;
  error?: string;
  pointCount: number;
  distanceKm: number;
}

/**
 * Converts an array of EditorPoints into a valid GeoJSON LineString.
 * GeoJSON coordinate standard: [longitude, latitude].
 */
export function toGeoJsonLineString(points: Array<{ lat: number; lng: number }>): GeoJsonLineString | null {
  if (!points || points.length < 2) return null;
  return {
    type: 'LineString',
    coordinates: points.map((p) => [
      Number(Number(p.lng).toFixed(7)),
      Number(Number(p.lat).toFixed(7)),
    ]),
  };
}

/**
 * Parses GeoJSON LineString into an array of EditorPoints for the map editor.
 */
export function fromGeoJsonLineString(geometry: GeoJsonLineString | null | undefined): EditorPoint[] {
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return [];
  }
  return geometry.coordinates
    .filter((coord) => Array.isArray(coord) && coord.length >= 2 && !Number.isNaN(coord[0]) && !Number.isNaN(coord[1]))
    .map((coord, idx) => ({
      id: `pt_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      lng: Number(Number(coord[0]).toFixed(7)),
      lat: Number(Number(coord[1]).toFixed(7)),
    }));
}

/**
 * Calculates the total straight-line Haversine distance along a series of points in kilometers.
 * Rounded to 2 decimal places.
 */
export function calculatePathDistanceKm(points: Array<{ lat: number; lng: number }>): number {
  if (!points || points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalMeters += calculateDistanceMeters(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng
    );
  }
  return Number((totalMeters / 1000).toFixed(2));
}

/**
 * Estimates driving duration in minutes from straight-line geometry distance.
 * Default average urban university bus speed: 25 km/h.
 */
export function estimateDurationMinutes(distanceKm: number, avgSpeedKmh: number = 25): number {
  if (distanceKm <= 0) return 0;
  const hours = distanceKm / Math.max(1, avgSpeedKmh);
  return Math.max(1, Math.round(hours * 60));
}

/**
 * Validates route geometry against GeoJSON LineString rules.
 */
export function validateRouteGeometry(points: Array<{ lat: number; lng: number }>): GeometryValidationResult {
  const count = points ? points.length : 0;
  const dist = calculatePathDistanceKm(points || []);

  if (!points || count === 0) {
    return {
      isValid: false,
      error: 'No geometry points added yet. Click on the map to add the route start point.',
      pointCount: 0,
      distanceKm: 0,
    };
  }

  if (count < 2) {
    return {
      isValid: false,
      error: 'At least 2 points (Start and End) are required to form a valid route.',
      pointCount: count,
      distanceKm: 0,
    };
  }

  let allIdentical = true;
  const first = points[0];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || Number.isNaN(p.lat) || Number.isNaN(p.lng)) {
      return {
        isValid: false,
        error: `Point #${i + 1} has invalid non-numeric coordinates.`,
        pointCount: count,
        distanceKm: dist,
      };
    }
    if (p.lat < -90 || p.lat > 90) {
      return {
        isValid: false,
        error: `Point #${i + 1} latitude (${p.lat}) is out of bounds [-90, 90].`,
        pointCount: count,
        distanceKm: dist,
      };
    }
    if (p.lng < -180 || p.lng > 180) {
      return {
        isValid: false,
        error: `Point #${i + 1} longitude (${p.lng}) is out of bounds [-180, 180].`,
        pointCount: count,
        distanceKm: dist,
      };
    }
    if (Math.abs(p.lat - first.lat) > 0.000001 || Math.abs(p.lng - first.lng) > 0.000001) {
      allIdentical = false;
    }
  }

  if (allIdentical) {
    return {
      isValid: false,
      error: 'All points are identical. A route must have at least two distinct locations.',
      pointCount: count,
      distanceKm: dist,
    };
  }

  return {
    isValid: true,
    pointCount: count,
    distanceKm: dist,
  };
}

export interface SnappedWaypoint {
  original_index: number;
  original_lat: number;
  original_lng: number;
  snapped_lat: number;
  snapped_lng: number;
  displacement_meters: number;
}

export interface RoadRouteResponse {
  route_id: number;
  route_name?: string;
  geometry: GeoJsonLineString;
  distance_km: number;
  duration_mins: number;
  coordinate_count: number;
  waypoints_snapped: SnappedWaypoint[];
  provider: string;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface RoadRouteCandidate {
  geometry: GeoJsonLineString;
  distanceKm: number;
  durationMins: number;
  coordinateCount: number;
  waypointsSnapped: SnappedWaypoint[];
  provider: string;
  warnings: string[];
  metadata: Record<string, unknown>;
  fingerprint: string;
}

/**
 * Computes a deterministic string fingerprint from an array of waypoints.
 * Used to detect when shaping points are edited after route generation.
 */
export function computeWaypointsFingerprint(points: Array<{ lat: number; lng: number }>): string {
  if (!points || points.length === 0) return '';
  return points
    .map((p) => `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`)
    .join('|');
}

/**
 * Inserts a new EditorPoint into the array at a specific 0-based index.
 * Clamps index between 0 and points.length.
 */
export function insertPointAtIndex(
  points: EditorPoint[],
  newPoint: EditorPoint,
  index: number
): EditorPoint[] {
  const safeIndex = Math.max(0, Math.min(index, points.length));
  return [
    ...points.slice(0, safeIndex),
    newPoint,
    ...points.slice(safeIndex),
  ];
}

/**
 * Moves an EditorPoint from fromIndex to toIndex.
 * Returns a new array preserving other points.
 */
export function movePoint(
  points: EditorPoint[],
  fromIndex: number,
  toIndex: number
): EditorPoint[] {
  if (
    fromIndex < 0 ||
    fromIndex >= points.length ||
    toIndex < 0 ||
    toIndex >= points.length ||
    fromIndex === toIndex
  ) {
    return [...points];
  }
  const result = [...points];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Calculates the difference between two distance measurements in km.
 */
export function calculateDistanceDelta(
  currentKm: number,
  previousKm: number
): { diffKm: number; formatted: string } {
  const diffKm = Number((currentKm - previousKm).toFixed(2));
  const sign = diffKm > 0 ? '+' : '';
  return {
    diffKm,
    formatted: `${sign}${diffKm.toFixed(2)} km`,
  };
}

/**
 * Finds the maximum waypoint displacement in meters among snapped waypoints.
 */
export function calculateMaxSnapDisplacement(snapped: SnappedWaypoint[]): number {
  if (!snapped || snapped.length === 0) return 0;
  const maxDisplacement = Math.max(...snapped.map((s) => s.displacement_meters || 0));
  return Number(maxDisplacement.toFixed(1));
}

export interface DraftSavePayload {
  geometry: GeoJsonLineString | null;
  distance_km: number;
  duration_mins: number;
  change_summary?: string;
  metadata: Record<string, unknown>;
}

export type DraftSavePlanResult =
  | {
      canSave: true;
      mode: 'road_route' | 'schematic';
      payload: DraftSavePayload;
    }
  | {
      canSave: false;
      error: string;
    };

/**
 * Resolves the save payload plan for a route revision draft.
 * Enforces integrity:
 * - If accepted road route is staged, verifies that the current shaping points match
 *   the fingerprint when the road route was accepted.
 * - If waypoints have changed, blocks saving to prevent persisting mismatched geometry.
 * - If in schematic mode (no accepted road route), builds clean schematic payload.
 */
export function resolveDraftSavePlan(params: {
  points: EditorPoint[];
  acceptedRoadGeometry: GeoJsonLineString | null;
  acceptedRoadMetrics: {
    distanceKm: number;
    durationMins: number;
    metadata: Record<string, unknown>;
  } | null;
  acceptedFingerprint?: string | null;
  changeSummary?: string;
}): DraftSavePlanResult {
  const {
    points,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint,
    changeSummary,
  } = params;

  const currentFingerprint = computeWaypointsFingerprint(points);

  // Case 1: Road route is staged
  if (acceptedRoadGeometry && acceptedRoadMetrics) {
    // Fail-Closed Integrity Guard:
    // When road geometry and metrics are present, a valid matching acceptedFingerprint
    // is strictly required. Missing, null, empty, or mismatched fingerprint must block saving.
    if (
      !acceptedFingerprint ||
      !acceptedFingerprint.trim() ||
      currentFingerprint !== acceptedFingerprint
    ) {
      return {
        canSave: false,
        error:
          'Shaping waypoints have changed since this road route was accepted, or the accepted route has no valid waypoint fingerprint. Regenerate the road route and accept the updated candidate, or revert to schematic geometry before saving.',
      };
    }

    // Unmodified accepted road route with valid matching fingerprint
    return {
      canSave: true,
      mode: 'road_route',
      payload: {
        geometry: acceptedRoadGeometry,
        distance_km: acceptedRoadMetrics.distanceKm,
        duration_mins: acceptedRoadMetrics.durationMins,
        change_summary: changeSummary?.trim() || undefined,
        metadata: {
          ...acceptedRoadMetrics.metadata,
          mode: 'road_route',
          shaping_points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        },
      },
    };
  }

  // Case 2: Schematic mode
  const geojson = toGeoJsonLineString(points);
  const distanceKm = calculatePathDistanceKm(points);
  const durationMins = estimateDurationMinutes(distanceKm);

  return {
    canSave: true,
    mode: 'schematic',
    payload: {
      geometry: geojson,
      distance_km: distanceKm,
      duration_mins: durationMins,
      change_summary: changeSummary?.trim() || undefined,
      metadata: {
        mode: 'schematic',
      },
    },
  };
}


