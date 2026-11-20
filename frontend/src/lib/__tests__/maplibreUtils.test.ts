import test from 'node:test';
import assert from 'node:assert';
import {
  leafletToMapLibreCoords,
  mapLibreToLeafletCoords,
  normalizeBearing,
  calculateBearing,
  interpolatePositionOnRoute,
  MOCK_CAMPUS_ROUTE,
  CAMERA_PRESETS,
  MAP_STYLES,
} from '../maplibreUtils.ts';

test('1. Coordinate conversion between Leaflet [lat, lng] and MapLibre [lng, lat]', () => {
  const leafletCoords: [number, number] = [23.8103, 90.4125];
  const maplibreCoords = leafletToMapLibreCoords(leafletCoords);

  assert.deepStrictEqual(maplibreCoords, [90.4125, 23.8103]);

  // Roundtrip inversion
  const inverted = mapLibreToLeafletCoords(maplibreCoords);
  assert.deepStrictEqual(inverted, leafletCoords);
});

test('2. Bearing normalization', () => {
  assert.strictEqual(normalizeBearing(0), 0);
  assert.strictEqual(normalizeBearing(360), 0);
  assert.strictEqual(normalizeBearing(90), 90);
  assert.strictEqual(normalizeBearing(450), 90);
  assert.strictEqual(normalizeBearing(-90), 270);
  assert.strictEqual(normalizeBearing(-45), 315);
});

test('3. Bearing calculation between coordinates', () => {
  // Heading due North: latitude increases, longitude same
  const bearingNorth = calculateBearing(23.0, 90.0, 24.0, 90.0);
  assert.strictEqual(Math.round(bearingNorth), 0);

  // Heading due East: latitude same, longitude increases
  const bearingEast = calculateBearing(23.0, 90.0, 23.0, 91.0);
  assert.strictEqual(Math.round(bearingEast), 90);

  // Heading due South: latitude decreases, longitude same
  const bearingSouth = calculateBearing(24.0, 90.0, 23.0, 90.0);
  assert.strictEqual(Math.round(bearingSouth), 180);

  // Heading due West: latitude same, longitude decreases
  const bearingWest = calculateBearing(23.0, 91.0, 23.0, 90.0);
  assert.strictEqual(Math.round(bearingWest), 270);
});

test('4. Route interpolation along waypoints', () => {
  const waypoints: [number, number][] = [
    [23.0, 90.0],
    [23.0, 91.0],
  ];

  // At progress = 0: exactly first waypoint
  const start = interpolatePositionOnRoute(waypoints, 0);
  assert.strictEqual(start.lat, 23.0);
  assert.strictEqual(start.lng, 90.0);
  assert.strictEqual(Math.round(start.heading), 90);

  // At progress = 0.5: exactly midpoint
  const mid = interpolatePositionOnRoute(waypoints, 0.5);
  assert.strictEqual(mid.lat, 23.0);
  assert.strictEqual(mid.lng, 90.5);

  // At progress = 1.0 (wrapped): at start/end
  const wrapped = interpolatePositionOnRoute(waypoints, 1.0);
  assert.strictEqual(wrapped.lat, 23.0);
  assert.strictEqual(wrapped.lng, 90.0);

  // Empty fallback
  const fallback = interpolatePositionOnRoute([], 0.5);
  assert.strictEqual(fallback.lat, 23.8103);
  assert.strictEqual(fallback.lng, 90.4125);
});

test('5. Static configurations: presets, styles, and campus route', () => {
  assert.ok(MOCK_CAMPUS_ROUTE.length >= 5, 'Campus route should have multiple waypoints');
  assert.ok(CAMERA_PRESETS.length >= 3, 'Should have multiple camera presets');
  assert.ok(MAP_STYLES.length >= 3, 'Should support vector and raster styles');

  const libertyStyle = MAP_STYLES.find((s) => s.id === 'openfreemap-liberty');
  assert.ok(libertyStyle, 'OpenFreeMap Liberty should be defined');
  assert.strictEqual(libertyStyle?.supports3DBuildings, true);
});
