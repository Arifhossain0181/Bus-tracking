import test from 'node:test';
import assert from 'node:assert';
import {
  acquireGpsFix,
  evaluateGpsFix,
  shouldTransmitLocationUpdate,
} from '../trackingStatus.ts';

// Helper mock for browser Geolocation provider
function createMockGeolocation(options: {
  coords?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
  error?: {
    code: number;
    message: string;
  };
  delayMs?: number;
}): Geolocation {
  return {
    getCurrentPosition(
      successCallback: PositionCallback,
      errorCallback?: PositionErrorCallback | null
    ) {
      setTimeout(() => {
        if (options.error) {
          const err: GeolocationPositionError = {
            code: options.error.code,
            message: options.error.message,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          };
          if (errorCallback) errorCallback(err);
        } else if (options.coords) {
          const pos: GeolocationPosition = {
            coords: {
              latitude: options.coords.latitude,
              longitude: options.coords.longitude,
              accuracy: options.coords.accuracy ?? 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: options.coords.heading ?? null,
              speed: options.coords.speed ?? null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          };
          successCallback(pos);
        }
      }, options.delayMs ?? 0);
    },
    watchPosition() {
      return 1;
    },
    clearWatch() {},
  } as unknown as Geolocation;
}

test('1. GPS acquired within timeout: successfully resolves with validated coordinates', async () => {
  const mockGeo = createMockGeolocation({
    coords: {
      latitude: 23.8765432,
      longitude: 90.3876543,
      accuracy: 15,
      speed: 8.2,
      heading: 90.0,
    },
  });

  const result = await acquireGpsFix({
    timeoutMs: 5000,
    maxAccuracyMeters: 100,
    geolocationProvider: mockGeo,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'acquired');
  assert.strictEqual(result.coords?.lat, 23.8765432);
  assert.strictEqual(result.coords?.lng, 90.3876543);
  assert.strictEqual(result.coords?.accuracy, 15);
  assert.strictEqual(result.coords?.speed, 8.2);
  assert.strictEqual(result.coords?.heading, 90.0);
});

test('2. GPS timeout handling: resolves with timeout status after timeout expired', async () => {
  const mockGeo = createMockGeolocation({
    error: {
      code: 3, // TIMEOUT
      message: 'Geolocation timed out.',
    },
  });

  const result = await acquireGpsFix({
    timeoutMs: 12000,
    geolocationProvider: mockGeo,
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'timeout');
  assert.ok(result.errorMessage?.includes('timed out'));
  assert.strictEqual(result.coords, undefined);
});

test('3. Permission denied handling: resolves with permission_denied status', async () => {
  const mockGeo = createMockGeolocation({
    error: {
      code: 1, // PERMISSION_DENIED
      message: 'User denied Geolocation',
    },
  });

  const result = await acquireGpsFix({
    geolocationProvider: mockGeo,
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'permission_denied');
  assert.ok(result.errorMessage?.includes('denied'));
  assert.strictEqual(result.coords, undefined);
});

test('4. GPS unavailable handling: resolves with position_unavailable status', async () => {
  const mockGeo = createMockGeolocation({
    error: {
      code: 2, // POSITION_UNAVAILABLE
      message: 'Network location provider at capacity',
    },
  });

  const result = await acquireGpsFix({
    geolocationProvider: mockGeo,
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'position_unavailable');
  assert.ok(result.errorMessage?.includes('unavailable'));
  assert.strictEqual(result.coords, undefined);
});

test('5. Poor GPS accuracy rejection: rejects accuracy > 100m', async () => {
  const mockGeo = createMockGeolocation({
    coords: {
      latitude: 23.8100,
      longitude: 90.4100,
      accuracy: 150, // exceeds 100m cutoff
    },
  });

  const result = await acquireGpsFix({
    maxAccuracyMeters: 100,
    geolocationProvider: mockGeo,
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'poor_accuracy');
  assert.strictEqual(result.coords?.accuracy, 150);
  assert.ok(result.errorMessage?.includes('accuracy too low'));
});

test('6. Invalid coordinates rejection: evaluateGpsFix rejects NaN and out-of-bounds degrees', () => {
  // NaN latitude
  const nanRes = evaluateGpsFix({ latitude: NaN, longitude: 90.4100, accuracy: 10 });
  assert.strictEqual(nanRes.isValid, false);
  assert.strictEqual(nanRes.status, 'error');

  // Out-of-bounds latitude (> 90)
  const oobLat = evaluateGpsFix({ latitude: 95.1234, longitude: 90.4100, accuracy: 10 });
  assert.strictEqual(oobLat.isValid, false);
  assert.strictEqual(oobLat.status, 'error');

  // Out-of-bounds longitude (> 180)
  const oobLng = evaluateGpsFix({ latitude: 23.8100, longitude: 185.0000, accuracy: 10 });
  assert.strictEqual(oobLng.isValid, false);
  assert.strictEqual(oobLng.status, 'error');

  // Non-numeric strings
  const stringRes = evaluateGpsFix({ latitude: 'bad-lat', longitude: 'bad-lng' });
  assert.strictEqual(stringRes.isValid, false);
  assert.strictEqual(stringRes.status, 'error');
});

test('7. Null Island (0, 0) rejection: evaluateGpsFix rejects (0, 0)', () => {
  const nullIsland = evaluateGpsFix({ latitude: 0, longitude: 0, accuracy: 10 });
  assert.strictEqual(nullIsland.isValid, false);
  assert.strictEqual(nullIsland.isAccurate, false);
  assert.strictEqual(nullIsland.status, 'error');
  assert.ok(nullIsland.errorReason?.includes('Null Island (0, 0)'));
});

test('8. Absence of hardcoded fallback: acquireGpsFix never returns 23.8103, 90.4125 on error', async () => {
  const failingGeo = createMockGeolocation({
    error: { code: 3, message: 'Timeout' },
  });

  const result = await acquireGpsFix({
    geolocationProvider: failingGeo,
  });

  assert.strictEqual(result.success, false);
  // Guarantee coordinates were not invented or defaulted to Dhaka
  if (result.coords) {
    const isHardcodedFallback =
      result.coords.lat === 23.8103 && result.coords.lng === 90.4125;
    assert.strictEqual(isHardcodedFallback, false);
  } else {
    assert.strictEqual(result.coords, undefined);
  }
});

test('9. Stationary transmission throttling: suppresses redundant updates when displacement < 3m and stationary', () => {
  const lastSentCoords = { lat: 23.8100000, lng: 90.4100000 };
  const lastSentTimeMs = 1000000;
  // Negligible movement (0.1m) within 5 seconds, speed 0
  const newCoords = { lat: 23.8100010, lng: 90.4100005, speed: 0.0 };

  const decision = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords,
    nowMs: lastSentTimeMs + 5000, // 5s elapsed (less than 15s keepalive)
    minDisplacementMeters: 3.0,
    keepaliveIntervalMs: 15000,
  });

  assert.strictEqual(decision.shouldSend, false);
  assert.strictEqual(decision.reason, 'stationary_throttled');
  assert.ok(decision.displacementMeters < 3.0);
});

test('10. Keepalive heartbeat transmission: forces transmission after 15s even when stationary', () => {
  const lastSentCoords = { lat: 23.8100000, lng: 90.4100000 };
  const lastSentTimeMs = 1000000;
  // Stationary position, but 16s have elapsed
  const newCoords = { lat: 23.8100000, lng: 90.4100000, speed: 0.0 };

  const decision = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords,
    nowMs: lastSentTimeMs + 16000, // 16s elapsed
    keepaliveIntervalMs: 15000,
  });

  assert.strictEqual(decision.shouldSend, true);
  assert.strictEqual(decision.reason, 'keepalive');
});

test('11. Movement transmission: permits transmission when displacement >= 3m or vehicle is moving', () => {
  const lastSentCoords = { lat: 23.8100000, lng: 90.4100000 };
  const lastSentTimeMs = 1000000;

  // Case A: Displaced by ~20 meters
  const movedCoords = { lat: 23.8102000, lng: 90.4100000, speed: 0.0 };
  const decisionDisplaced = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords: movedCoords,
    nowMs: lastSentTimeMs + 5000,
  });
  assert.strictEqual(decisionDisplaced.shouldSend, true);
  assert.strictEqual(decisionDisplaced.reason, 'movement');

  // Case B: Small displacement (1m) but moving speed > 0.5 m/s
  const speedCoords = { lat: 23.8100050, lng: 90.4100050, speed: 1.2 };
  const decisionSpeed = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords: speedCoords,
    nowMs: lastSentTimeMs + 5000,
  });
  assert.strictEqual(decisionSpeed.shouldSend, true);
  assert.strictEqual(decisionSpeed.reason, 'movement');
});

test('12. Implausible jump rejection: rejects jump > 1500m within telemetry interval', () => {
  const lastSentCoords = { lat: 23.8100000, lng: 90.4100000 };
  const lastSentTimeMs = 1000000;
  // Jump from Dhaka to Gazipur (approx 25 km away)
  const teleportCoords = { lat: 24.0000000, lng: 90.4200000, speed: 15.0 };

  const decision = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords: teleportCoords,
    nowMs: lastSentTimeMs + 5000,
    maxJumpMeters: 1500,
  });

  assert.strictEqual(decision.shouldSend, false);
  assert.strictEqual(decision.reason, 'implausible_jump');
  assert.ok(decision.displacementMeters > 1500);
});

test('13. Signal gap recovery: legitimate vehicle transit after a 2-minute signal gap is accepted and not blocked', () => {
  const lastSentCoords = { lat: 23.8100000, lng: 90.4100000 };
  const lastSentTimeMs = 1000000;
  // Displaced by ~2000 meters after 120 seconds (avg speed ~60 km/h)
  const tunnelExitCoords = { lat: 23.8280000, lng: 90.4100000, speed: 15.0 };

  const decision = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords: tunnelExitCoords,
    nowMs: lastSentTimeMs + 120000, // 2 minutes elapsed
    maxJumpMeters: 1500,
  });

  assert.strictEqual(decision.shouldSend, true);
  assert.strictEqual(decision.reason, 'movement');
  assert.ok(decision.displacementMeters > 1500);
});

test('14. Implausible jump rejected even after gap if implied speed exceeds 150 km/h limits', () => {
  const lastSentCoords = { lat: 23.8100000, lng: 90.4100000 };
  const lastSentTimeMs = 1000000;
  // Jump of 50 km after only 2 minutes (implied speed ~1500 km/h, supersonic)
  const impossibleJump = { lat: 24.2600000, lng: 90.4100000, speed: 20.0 };

  const decision = shouldTransmitLocationUpdate({
    lastSentCoords,
    lastSentTimeMs,
    newCoords: impossibleJump,
    nowMs: lastSentTimeMs + 120000, // 2 minutes elapsed
    maxJumpMeters: 1500,
  });

  assert.strictEqual(decision.shouldSend, false);
  assert.strictEqual(decision.reason, 'implausible_jump');
});
