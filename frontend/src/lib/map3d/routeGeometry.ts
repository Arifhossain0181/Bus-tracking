export interface Coordinate {
  lat: number;
  lng: number;
}

export interface StopInfo {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  order?: number;
  scheduledTime?: string;
  isMajor?: boolean;
}

/**
 * Calculates distance in kilometers between two GPS coordinates using the Haversine formula.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the total length in kilometers of a polyline given as [lng, lat][]
 */
export function calculatePolylineLengthKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += calculateDistanceKm(
      coords[i][1],
      coords[i][0],
      coords[i + 1][1],
      coords[i + 1][0]
    );
  }
  return total;
}

/**
 * Finds the index of the closest point along the route to the current bus position.
 */
export function findClosestRouteIndex(
  busLng: number,
  busLat: number,
  routeCoords: [number, number][]
): number {
  if (routeCoords.length === 0) return 0;
  let minDistance = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < routeCoords.length; i++) {
    const d = calculateDistanceKm(busLat, busLng, routeCoords[i][1], routeCoords[i][0]);
    if (d < minDistance) {
      minDistance = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Splits a route polyline into Completed (past) and Remaining (future) segments
 * based on the bus's current location.
 */
export function splitRouteByBusPosition(
  busLng: number,
  busLat: number,
  routeCoords: [number, number][]
): {
  completed: [number, number][];
  remaining: [number, number][];
  progressPercent: number;
} {
  if (routeCoords.length < 2) {
    return {
      completed: routeCoords,
      remaining: [],
      progressPercent: 100,
    };
  }

  const closestIdx = findClosestRouteIndex(busLng, busLat, routeCoords);
  const busPoint: [number, number] = [busLng, busLat];

  // Completed: from start up to bus position
  const completed: [number, number][] = [
    ...routeCoords.slice(0, closestIdx + 1),
    busPoint,
  ];

  // Remaining: from bus position to the destination
  const remaining: [number, number][] = [
    busPoint,
    ...routeCoords.slice(closestIdx + 1),
  ];

  const totalLength = calculatePolylineLengthKm(routeCoords);
  const completedLength = calculatePolylineLengthKm(completed);

  const progressPercent =
    totalLength > 0
      ? Math.min(100, Math.max(0, Math.round((completedLength / totalLength) * 100)))
      : 50;

  return { completed, remaining, progressPercent };
}

/**
 * Determines the next upcoming stop along the ordered stops list.
 */
export function getNextUpcomingStop(
  busLng: number,
  busLat: number,
  stops: StopInfo[]
): {
  nextStop: StopInfo | null;
  distanceKm: number;
  estimatedMinutes: number;
} {
  if (stops.length === 0) {
    return { nextStop: null, distanceKm: 0, estimatedMinutes: 0 };
  }

  // Find stop with the smallest distance that is ahead of the bus or nearest stop
  let nearestIdx = 0;
  let minDistance = Infinity;

  for (let i = 0; i < stops.length; i++) {
    const dist = calculateDistanceKm(
      busLat,
      busLng,
      stops[i].latitude,
      stops[i].longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      nearestIdx = i;
    }
  }

  // If the bus is very close to nearestIdx (< 100m) and there's a subsequent stop, the next stop is nearestIdx + 1
  let targetStopIdx = nearestIdx;
  if (minDistance < 0.15 && nearestIdx < stops.length - 1) {
    targetStopIdx = nearestIdx + 1;
  }

  const targetStop = stops[targetStopIdx];
  const targetDistance = calculateDistanceKm(
    busLat,
    busLng,
    targetStop.latitude,
    targetStop.longitude
  );

  // Approximate ETA in minutes assuming average city speed of 25 km/h if stationary, or based on speed
  const estimatedMinutes = Math.max(1, Math.round((targetDistance / 25) * 60));

  return {
    nextStop: targetStop,
    distanceKm: Number(targetDistance.toFixed(1)),
    estimatedMinutes,
  };
}

/**
 * Resolves fallback route coordinates when backend-planned road geometry is not available.
 *
 * CRITICAL ROUTE GEOMETRY INTEGRITY RULE:
 * In accordance with Task 022/022.1 pilot standardization, direct browser-side calls to
 * public demo routing endpoints (router.project-osrm.org) have been completely eliminated.
 * True road geometry is generated strictly server-side via schedules.routing.providers and
 * delivered to the client via RouteRevision snapshots or plannedRouteGeometry props.
 *
 * Coordinates returned by this fallback are purely SCHEMATIC straight lines connecting stops.
 * They must NEVER be misrepresented as true road-snapped geometry, must NOT snap vehicle GPS
 * positions off their genuine telemetry coordinates, and cannot silently overwrite accepted road routes.
 */
export async function fetchRoadRouteGeometry(
  stops: StopInfo[]
): Promise<[number, number][]> {
  if (stops.length < 2) {
    return stops.map((s) => [s.longitude, s.latitude]);
  }

  // Safe client fallback: return stops polyline without issuing external network requests.
  // True road geometry is supplied via roadGeometry or routePath props from backend API.
  return stops.map((s) => [s.longitude, s.latitude]);
}

/**
 * Determines the current location name of the bus based on proximity to stops/areas along the route.
 * Matches the floating green pill indicator ("• Dhaka") from the user's reference image.
 */
export function getCurrentLocationName(
  busLng: number,
  busLat: number,
  stops: StopInfo[]
): string {
  if (stops.length === 0) return 'Dhaka';

  let nearestStop = stops[0];
  let minDistance = Infinity;
  let nearestIdx = 0;

  for (let i = 0; i < stops.length; i++) {
    const dist = calculateDistanceKm(
      busLat,
      busLng,
      stops[i].latitude,
      stops[i].longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      nearestStop = stops[i];
      nearestIdx = i;
    }
  }

  // If within 350 meters of a stop, show the exact stop name
  if (minDistance <= 0.35) {
    return nearestStop.name;
  }

  // If moving between stops, show "Passing [Nearest Stop]" or "Towards [Next Stop]"
  if (nearestIdx < stops.length - 1) {
    const nextStop = stops[nearestIdx + 1];
    return `${nearestStop.name} → ${nextStop.name}`;
  }

  return nearestStop.name;
}

/**
 * Snaps a bus coordinate to the closest point along the road geometry
 * so it stays strictly on the road asphalt, never inside buildings.
 */
export function snapBusToRoad(
  busLng: number,
  busLat: number,
  roadCoords: [number, number][],
  maxDistanceKm: number = 0.05 // 50 meters
): [number, number] {
  if (roadCoords.length === 0) return [busLng, busLat];

  let minDistance = Infinity;
  let bestPoint = roadCoords[0];

  for (let i = 0; i < roadCoords.length; i++) {
    const d = calculateDistanceKm(busLat, busLng, roadCoords[i][1], roadCoords[i][0]);
    if (d < minDistance) {
      minDistance = d;
      bestPoint = roadCoords[i];
    }
  }

  if (minDistance <= maxDistanceKm) {
    return [bestPoint[0], bestPoint[1]];
  }

  return [busLng, busLat];
}

/**
 * Calculates compass bearing (0-360 degrees) from point 1 to point 2
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

  const radians = Math.atan2(y, x);
  const degrees = (radians * 180) / Math.PI;
  return Math.round((degrees + 360) % 360);
}

/**
 * Derives the exact road heading angle for a vehicle on a polyline path.
 * Guarantees the bus icon always points forward in the direction of the road.
 */
export function getBusRoadHeading(
  busLng: number,
  busLat: number,
  roadCoords: [number, number][],
  defaultHeading: number = 0
): number {
  if (roadCoords.length < 2) return defaultHeading;
  const idx = findClosestRouteIndex(busLng, busLat, roadCoords);
  if (idx < roadCoords.length - 1) {
    const p1 = roadCoords[idx];
    const p2 = roadCoords[idx + 1];
    return calculateBearing(p1[1], p1[0], p2[1], p2[0]);
  } else if (idx > 0) {
    const p1 = roadCoords[idx - 1];
    const p2 = roadCoords[idx];
    return calculateBearing(p1[1], p1[0], p2[1], p2[0]);
  }
  return defaultHeading;
}
