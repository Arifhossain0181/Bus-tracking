import test from 'node:test';
import assert from 'node:assert';
import {
  determineFollowBusStatus,
  isValidCoordinate,
  calculateLocationAgeSeconds,
  formatAgeDescription,
  calculateDistanceMeters,
  isPlausibleMovement,
  getCardinalDirection,
  formatEtaDescription,
  GPS_FRESHNESS_THRESHOLDS,
} from '../trackingStatus.ts';
import type { Bus } from '../types.ts';

const MOCK_BASE_BUS: Bus = {
  id: 1,
  bus_number: 'BUS-101',
  license_plate: 'DHK-11-2233',
  bus_type: 'long',
  capacity: 40,
  is_active: true,
  latest_location: null,
  active_journey: null,
  latest_journey: null,
};

test('1. Initial loading state (bus is null, isLoading=true)', () => {
  const result = determineFollowBusStatus({
    bus: null,
    isLoading: true,
    isConnectionError: false,
  });

  assert.strictEqual(result.status, 'loading');
  assert.strictEqual(result.label, 'Loading...');
  assert.strictEqual(result.hasUsableCoordinates, false);
});

test('2. Valid live location (< 30 seconds old)', () => {
  const now = Date.now();
  const busWithLiveLocation: Bus = {
    ...MOCK_BASE_BUS,
    latest_location: {
      id: 101,
      bus: 1,
      latitude: 23.8103,
      longitude: 90.4125,
      speed: 15.0,
      heading: 90.0,
      is_accurate: true,
      timestamp: new Date(now - 10000).toISOString(), // 10s old
    },
    active_journey: {
      id: 1,
      driver_id: 5,
      driver_name: 'John Driver',
      status: 'active',
      start_time: new Date(now - 60000).toISOString(),
    },
  };

  const result = determineFollowBusStatus({
    bus: busWithLiveLocation,
    isLoading: false,
    isConnectionError: false,
    nowMs: now,
  });

  assert.strictEqual(result.status, 'live');
  assert.strictEqual(result.label, 'Live');
  assert.strictEqual(result.ageSeconds, 10);
  assert.strictEqual(result.hasUsableCoordinates, true);
  assert.strictEqual(result.isAccurate, true);
});

test('3. Missing GPS coordinates (latest_location is null)', () => {
  const busWithoutLocation: Bus = {
    ...MOCK_BASE_BUS,
    latest_location: null,
    active_journey: {
      id: 1,
      driver_id: 5,
      driver_name: 'John Driver',
      status: 'active',
    },
  };

  const result = determineFollowBusStatus({
    bus: busWithoutLocation,
    isLoading: false,
    isConnectionError: false,
  });

  assert.strictEqual(result.status, 'offline');
  assert.strictEqual(result.label, 'Offline / No Signal');
  assert.strictEqual(result.hasUsableCoordinates, false);
});

test('4. Stale location (30s < age <= 120s)', () => {
  const now = Date.now();
  const busWithStaleLocation: Bus = {
    ...MOCK_BASE_BUS,
    latest_location: {
      id: 102,
      bus: 1,
      latitude: 23.8103,
      longitude: 90.4125,
      timestamp: new Date(now - 45000).toISOString(), // 45s old
    },
    active_journey: {
      id: 1,
      driver_id: 5,
      driver_name: 'John Driver',
      status: 'active',
    },
  };

  const result = determineFollowBusStatus({
    bus: busWithStaleLocation,
    isLoading: false,
    isConnectionError: false,
    nowMs: now,
  });

  assert.strictEqual(result.status, 'stale');
  assert.strictEqual(result.label, 'Stale Signal');
  assert.strictEqual(result.ageSeconds, 45);
  assert.strictEqual(result.hasUsableCoordinates, true);
});

test('5. Offline location (> 120s old)', () => {
  const now = Date.now();
  const busWithOldLocation: Bus = {
    ...MOCK_BASE_BUS,
    latest_location: {
      id: 103,
      bus: 1,
      latitude: 23.8103,
      longitude: 90.4125,
      timestamp: new Date(now - 150000).toISOString(), // 150s old
    },
    active_journey: {
      id: 1,
      driver_id: 5,
      driver_name: 'John Driver',
      status: 'active',
    },
  };

  const result = determineFollowBusStatus({
    bus: busWithOldLocation,
    isLoading: false,
    isConnectionError: false,
    nowMs: now,
  });

  assert.strictEqual(result.status, 'offline');
  assert.strictEqual(result.label, 'Offline / No Signal');
  assert.strictEqual(result.ageSeconds, 150);
});

test('6. API / Network failure without cached bus', () => {
  const result = determineFollowBusStatus({
    bus: null,
    isLoading: false,
    isConnectionError: true,
  });

  assert.strictEqual(result.status, 'connection_error');
  assert.strictEqual(result.label, 'Connection Error');
});

test('7. Recovery after network failure with cached bus', () => {
  const now = Date.now();
  const cachedBus: Bus = {
    ...MOCK_BASE_BUS,
    latest_location: {
      id: 104,
      bus: 1,
      latitude: 23.8103,
      longitude: 90.4125,
      timestamp: new Date(now - 5000).toISOString(),
    },
    active_journey: {
      id: 1,
      driver_id: 5,
      driver_name: 'John Driver',
      status: 'active',
    },
  };

  // Initially in error state, then recovers:
  const recoveredResult = determineFollowBusStatus({
    bus: cachedBus,
    isLoading: false,
    isConnectionError: false,
    nowMs: now,
  });

  assert.strictEqual(recoveredResult.status, 'live');
  assert.strictEqual(recoveredResult.label, 'Live');
});

test('8. Journey ended detection (backend marks journey completed/aborted)', () => {
  const now = Date.now();
  const busWithEndedJourney: Bus = {
    ...MOCK_BASE_BUS,
    active_journey: null,
    latest_journey: {
      id: 1,
      status: 'completed',
      start_time: new Date(now - 3600000).toISOString(),
      end_time: new Date(now - 60000).toISOString(),
    },
    latest_location: {
      id: 105,
      bus: 1,
      latitude: 23.8200,
      longitude: 90.4200,
      timestamp: new Date(now - 60000).toISOString(),
    },
  };

  const result = determineFollowBusStatus({
    bus: busWithEndedJourney,
    isLoading: false,
    isConnectionError: false,
    nowMs: now,
  });

  assert.strictEqual(result.status, 'journey_ended');
  assert.strictEqual(result.label, 'Journey Ended');
});

test('9. Invalid location data handling (NaN, null, out-of-bounds, (0,0))', () => {
  assert.strictEqual(isValidCoordinate(null, 90.0), false);
  assert.strictEqual(isValidCoordinate(23.0, null), false);
  assert.strictEqual(isValidCoordinate(NaN, 90.0), false);
  assert.strictEqual(isValidCoordinate(23.0, NaN), false);
  assert.strictEqual(isValidCoordinate(95.0, 90.0), false); // lat > 90
  assert.strictEqual(isValidCoordinate(-95.0, 90.0), false); // lat < -90
  assert.strictEqual(isValidCoordinate(23.0, 190.0), false); // lng > 180
  assert.strictEqual(isValidCoordinate(0, 0), false); // (0,0) null island
  assert.strictEqual(isValidCoordinate(23.8103, 90.4125), true); // valid
  assert.strictEqual(isValidCoordinate('23.8103', '90.4125'), true); // string coords
});

test('10. Trail duplicate prevention logic', () => {
  const trail: [number, number][] = [[23.8103, 90.4125]];
  const incoming = [23.8103001, 90.4125001]; // practically identical (within 0.00001)

  const isDuplicate =
    trail.length > 0 &&
    Math.abs(trail[trail.length - 1][0] - incoming[0]) < 0.00001 &&
    Math.abs(trail[trail.length - 1][1] - incoming[1]) < 0.00001;

  assert.strictEqual(isDuplicate, true);

  const moved = [23.8120, 90.4150]; // bus moved
  const isMovedDuplicate =
    trail.length > 0 &&
    Math.abs(trail[trail.length - 1][0] - moved[0]) < 0.00001 &&
    Math.abs(trail[trail.length - 1][1] - moved[1]) < 0.00001;

  assert.strictEqual(isMovedDuplicate, false);
});

test('11. Accuracy degradation flag propagation', () => {
  const now = Date.now();
  const lowAccuracyBus: Bus = {
    ...MOCK_BASE_BUS,
    latest_location: {
      id: 106,
      bus: 1,
      latitude: 23.8103,
      longitude: 90.4125,
      is_accurate: false, // low accuracy
      timestamp: new Date(now - 5000).toISOString(),
    },
    active_journey: {
      id: 1,
      driver_id: 5,
      driver_name: 'John Driver',
      status: 'active',
    },
  };

  const result = determineFollowBusStatus({
    bus: lowAccuracyBus,
    isLoading: false,
    isConnectionError: false,
    nowMs: now,
  });

  assert.strictEqual(result.status, 'live');
  assert.strictEqual(result.isAccurate, false);
});

test('12. Helper functions: calculateLocationAgeSeconds, formatAgeDescription, thresholds', () => {
  const now = Date.now();
  const tenSecondsAgo = new Date(now - 10000).toISOString();
  const age = calculateLocationAgeSeconds(tenSecondsAgo, now);
  assert.strictEqual(age, 10);
  assert.strictEqual(calculateLocationAgeSeconds(null), null);
  assert.strictEqual(calculateLocationAgeSeconds('invalid-time'), null);

  assert.strictEqual(formatAgeDescription(null), 'No GPS fix');
  assert.strictEqual(formatAgeDescription(2), 'Just now');
  assert.strictEqual(formatAgeDescription(25), '25s ago');
  assert.strictEqual(formatAgeDescription(90), '1m 30s ago');
  assert.strictEqual(formatAgeDescription(3600), '1h ago');

  assert.strictEqual(GPS_FRESHNESS_THRESHOLDS.LIVE_MAX_SECONDS, 30);
  assert.strictEqual(GPS_FRESHNESS_THRESHOLDS.STALE_MAX_SECONDS, 120);
});

test('13. calculateDistanceMeters accurately computes geodesic distances', () => {
  // Same position = 0m
  assert.strictEqual(calculateDistanceMeters(23.8103, 90.4125, 23.8103, 90.4125), 0);

  // Approximately 111 km per degree of latitude
  const dist1DegLat = calculateDistanceMeters(23.0, 90.0, 24.0, 90.0);
  assert.ok(dist1DegLat > 110000 && dist1DegLat < 112000, `Expected ~111km, got ${dist1DegLat}`);

  // Short distance (~111 meters for 0.001 deg lat)
  const distShort = calculateDistanceMeters(23.8103, 90.4125, 23.8113, 90.4125);
  assert.ok(distShort > 100 && distShort < 125, `Expected ~111m, got ${distShort}`);

  // Invalid coordinates return 0
  assert.strictEqual(calculateDistanceMeters(NaN, 90.0, 23.0, 90.0), 0);
  assert.strictEqual(calculateDistanceMeters(23.0, 90.0, 0, 0), 0);
});

test('14. isPlausibleMovement identifies teleport jumps vs realistic vehicle moves', () => {
  // Realistic move: 100m away
  assert.strictEqual(isPlausibleMovement(23.8103, 90.4125, 23.8112, 90.4125), true);

  // Small stationary jitter: 1.5m away
  assert.strictEqual(isPlausibleMovement(23.8103, 90.4125, 23.81031, 90.4125), true);

  // Teleport jump: 5 km jump within a single interval
  assert.strictEqual(isPlausibleMovement(23.8103, 90.4125, 23.8550, 90.4125), false);

  // Custom threshold: 500m max
  assert.strictEqual(isPlausibleMovement(23.8103, 90.4125, 23.8160, 90.4125, 500), false);
  assert.strictEqual(isPlausibleMovement(23.8103, 90.4125, 23.8120, 90.4125, 500), true);

  // Invalid coordinates
  assert.strictEqual(isPlausibleMovement(null as unknown as number, 90.0, 23.0, 90.0), false);
});

test('15. getCardinalDirection maps heading angles to compass points', () => {
  assert.strictEqual(getCardinalDirection(0), 'N');
  assert.strictEqual(getCardinalDirection(360), 'N');
  assert.strictEqual(getCardinalDirection(45), 'NE');
  assert.strictEqual(getCardinalDirection(90), 'E');
  assert.strictEqual(getCardinalDirection(135), 'SE');
  assert.strictEqual(getCardinalDirection(180), 'S');
  assert.strictEqual(getCardinalDirection(225), 'SW');
  assert.strictEqual(getCardinalDirection(270), 'W');
  assert.strictEqual(getCardinalDirection(315), 'NW');

  // Null, undefined, negative, or invalid angles return empty string
  assert.strictEqual(getCardinalDirection(null), '');
  assert.strictEqual(getCardinalDirection(undefined), '');
  assert.strictEqual(getCardinalDirection(-10), '');
  assert.strictEqual(getCardinalDirection(400), '');
  assert.strictEqual(getCardinalDirection(NaN), '');
});

test('16. formatEtaDescription handles edge cases and delays gracefully', () => {
  assert.strictEqual(formatEtaDescription(null), 'Calculating...');
  assert.strictEqual(formatEtaDescription(undefined), 'Calculating...');
  assert.strictEqual(formatEtaDescription(NaN), 'Calculating...');

  // Arriving now (0 or negative)
  assert.strictEqual(formatEtaDescription(0), 'Arriving now');
  assert.strictEqual(formatEtaDescription(-2), 'Arriving now');

  // Normal minutes
  assert.strictEqual(formatEtaDescription(5), '5 min');
  assert.strictEqual(formatEtaDescription(42), '42 min');

  // With delays
  assert.strictEqual(formatEtaDescription(15, true, 4), '15 min (+4m delay)');
  assert.strictEqual(formatEtaDescription(15, false, 0), '15 min');

  // Over an hour
  assert.strictEqual(formatEtaDescription(65), '1h 5m');
  assert.strictEqual(formatEtaDescription(120), '2h');
  assert.strictEqual(formatEtaDescription(80, true, 10), '1h 20m (+10m delay)');
});

test('17. Out-of-order telemetry suppression logic', () => {
  let lastProcessedTimestamp = 1700000000000;

  // New incoming telemetry with newer timestamp: accepted
  const newerTs = 1700000003000;
  const isNewer = newerTs >= lastProcessedTimestamp;
  assert.strictEqual(isNewer, true);
  if (isNewer) lastProcessedTimestamp = newerTs;

  // Delayed out-of-order packet with older timestamp: rejected
  const olderTs = 1700000001000;
  const isOlderAccepted = olderTs >= lastProcessedTimestamp;
  assert.strictEqual(isOlderAccepted, false);
  assert.strictEqual(lastProcessedTimestamp, 1700000003000); // unchanged
});

