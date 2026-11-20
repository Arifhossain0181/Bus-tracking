import type { Bus } from './types';

export type FollowBusStatus =
  | 'loading'
  | 'live'
  | 'stale'
  | 'offline'
  | 'journey_ended'
  | 'connection_error';

export interface FollowBusStatusInfo {
  status: FollowBusStatus;
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
  ageSeconds: number | null;
  isAccurate: boolean;
  hasUsableCoordinates: boolean;
}

export const GPS_FRESHNESS_THRESHOLDS = {
  LIVE_MAX_SECONDS: 30,
  STALE_MAX_SECONDS: 120,
} as const;

/**
 * Validates latitude and longitude values.
 * Returns true if valid finite numbers in realistic ranges and not (0, 0).
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (lat == null || lng == null) return false;
  const numLat = typeof lat === 'number' ? lat : Number(lat);
  const numLng = typeof lng === 'number' ? lng : Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return false;
  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) return false;
  if (numLat === 0 && numLng === 0) return false;
  return true;
}

/**
 * Calculates geodesic distance between two points in meters using the Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return 0;
  const R = 6371000; // Earth radius in meters
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
 * Checks whether movement between two points is physically plausible within a telemetry interval.
 * Rejects jumps larger than maxJumpMeters (default 2000m / 2km) to avoid visual teleport artifacts.
 */
export function isPlausibleMovement(
  prevLat: number,
  prevLng: number,
  nextLat: number,
  nextLng: number,
  maxJumpMeters: number = 2000
): boolean {
  if (!isValidCoordinate(prevLat, prevLng) || !isValidCoordinate(nextLat, nextLng)) return false;
  const dist = calculateDistanceMeters(prevLat, prevLng, nextLat, nextLng);
  return dist <= maxJumpMeters;
}

/**
 * Returns cardinal compass direction (N, NE, E, SE, S, SW, W, NW) for a heading angle.
 */
export function getCardinalDirection(headingDeg: number | null | undefined): string {
  if (headingDeg == null || !Number.isFinite(headingDeg) || headingDeg < 0 || headingDeg > 360) {
    return '';
  }
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(headingDeg / 45) % 8;
  return directions[index];
}

/**
 * Human-readable estimated arrival string with delay indicators.
 */
export function formatEtaDescription(
  remainingMinutes: number | null | undefined,
  isDelayed: boolean = false,
  delayMinutes: number = 0
): string {
  if (remainingMinutes == null || !Number.isFinite(remainingMinutes)) {
    return 'Calculating...';
  }
  if (remainingMinutes <= 0) {
    return 'Arriving now';
  }
  const delaySuffix = isDelayed && delayMinutes > 0 ? ` (+${delayMinutes}m delay)` : '';
  if (remainingMinutes < 60) {
    return `${remainingMinutes} min${delaySuffix}`;
  }
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m${delaySuffix}` : `${hours}h${delaySuffix}`;
}

/**
 * Calculates elapsed seconds between a backend ISO timestamp and current time.
 */
export function calculateLocationAgeSeconds(
  timestamp?: string | null,
  nowMs: number = Date.now()
): number | null {
  if (!timestamp) return null;
  const parsedTime = new Date(timestamp).getTime();
  if (isNaN(parsedTime)) return null;
  const diffMs = nowMs - parsedTime;
  return Math.max(0, Math.floor(diffMs / 1000));
}

/**
 * Human-readable relative time string.
 */
export function formatAgeDescription(ageSeconds: number | null): string {
  if (ageSeconds === null) return 'No GPS fix';
  if (ageSeconds < 5) return 'Just now';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const minutes = Math.floor(ageSeconds / 60);
  const remainderSeconds = ageSeconds % 60;
  if (minutes < 60) {
    return remainderSeconds > 0 ? `${minutes}m ${remainderSeconds}s ago` : `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Evaluates the definitive tracking condition for the Follow Bus view.
 * Uses backend timestamps, journey status, and network state.
 */
export function determineFollowBusStatus(params: {
  bus: Bus | null;
  isLoading: boolean;
  isConnectionError: boolean;
  nowMs?: number;
}): FollowBusStatusInfo {
  const { bus, isLoading, isConnectionError, nowMs = Date.now() } = params;

  // 1. Loading state (initial fetch not completed)
  if (isLoading && !bus) {
    return {
      status: 'loading',
      label: 'Loading...',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      dotClass: 'bg-slate-400',
      description: 'Connecting to tracking telemetry...',
      ageSeconds: null,
      isAccurate: true,
      hasUsableCoordinates: false,
    };
  }

  // 2. Connection error (failed initial fetch)
  if (isConnectionError && !bus) {
    return {
      status: 'connection_error',
      label: 'Connection Error',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      dotClass: 'bg-rose-500',
      description: 'Unable to reach telemetry server. Retrying...',
      ageSeconds: null,
      isAccurate: false,
      hasUsableCoordinates: false,
    };
  }

  const latestLocation = bus?.latest_location;
  const hasUsableCoordinates = Boolean(
    latestLocation && isValidCoordinate(latestLocation.latitude, latestLocation.longitude)
  );
  const isAccurate = latestLocation?.is_accurate ?? true;

  // 3. Journey ended (backend explicitly marks journey as completed/aborted)
  const isJourneyEnded = Boolean(
    !bus?.active_journey &&
    bus?.latest_journey &&
    (bus.latest_journey.status === 'completed' || bus.latest_journey.status === 'aborted')
  );

  if (isJourneyEnded) {
    const ageSeconds = calculateLocationAgeSeconds(latestLocation?.timestamp, nowMs);
    return {
      status: 'journey_ended',
      label: 'Journey Ended',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      dotClass: 'bg-slate-500',
      description: 'The driver has completed this journey.',
      ageSeconds,
      isAccurate,
      hasUsableCoordinates,
    };
  }

  // 4. Missing location / no GPS fix yet
  if (!latestLocation || !hasUsableCoordinates) {
    return {
      status: 'offline',
      label: 'Offline / No Signal',
      badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-300',
      dotClass: 'bg-zinc-400',
      description: 'Waiting for GPS fix from vehicle.',
      ageSeconds: null,
      isAccurate: false,
      hasUsableCoordinates: false,
    };
  }

  const ageSeconds = calculateLocationAgeSeconds(latestLocation.timestamp, nowMs);

  // If timestamp could not be parsed
  if (ageSeconds === null) {
    return {
      status: 'offline',
      label: 'Offline / No Signal',
      badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-300',
      dotClass: 'bg-zinc-400',
      description: 'Invalid GPS timestamp received.',
      ageSeconds: null,
      isAccurate: false,
      hasUsableCoordinates,
    };
  }

  // 5. Offline (> 120 seconds old)
  if (ageSeconds > GPS_FRESHNESS_THRESHOLDS.STALE_MAX_SECONDS) {
    return {
      status: 'offline',
      label: 'Offline / No Signal',
      badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-300',
      dotClass: 'bg-zinc-400',
      description: `Signal lost (${formatAgeDescription(ageSeconds)}).`,
      ageSeconds,
      isAccurate: false,
      hasUsableCoordinates,
    };
  }

  // 6. Stale (30s < age <= 120s)
  if (ageSeconds > GPS_FRESHNESS_THRESHOLDS.LIVE_MAX_SECONDS) {
    return {
      status: 'stale',
      label: 'Stale Signal',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      dotClass: 'bg-amber-500',
      description: `Telemetry delayed (last fix ${formatAgeDescription(ageSeconds)}).`,
      ageSeconds,
      isAccurate,
      hasUsableCoordinates,
    };
  }

  // 7. Live (age <= 30s)
  return {
    status: 'live',
    label: 'Live',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dotClass: 'bg-emerald-500 animate-pulse',
    description: `Updated ${formatAgeDescription(ageSeconds)}.`,
    ageSeconds,
    isAccurate,
    hasUsableCoordinates: true,
  };
}
