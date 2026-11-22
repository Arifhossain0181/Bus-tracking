import test from 'node:test';
import assert from 'node:assert';
import {
  toGeoJsonLineString,
  fromGeoJsonLineString,
  calculatePathDistanceKm,
  estimateDurationMinutes,
  validateRouteGeometry,
  type EditorPoint,
} from '../routeGeometry.ts';

test('1. toGeoJsonLineString converts editor points to GeoJSON LineString [lng, lat]', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8150, lng: 90.4200 },
    { id: '3', lat: 23.8200, lng: 90.4250 },
  ];

  const geojson = toGeoJsonLineString(points);
  assert.ok(geojson);
  assert.strictEqual(geojson.type, 'LineString');
  assert.strictEqual(geojson.coordinates.length, 3);
  // Coordinates are [longitude, latitude]
  assert.deepStrictEqual(geojson.coordinates[0], [90.4125, 23.8103]);
  assert.deepStrictEqual(geojson.coordinates[1], [90.42, 23.815]);
  assert.deepStrictEqual(geojson.coordinates[2], [90.425, 23.82]);
});

test('2. toGeoJsonLineString returns null for fewer than 2 points', () => {
  assert.strictEqual(toGeoJsonLineString([]), null);
  assert.strictEqual(toGeoJsonLineString([{ lat: 23.81, lng: 90.41 }]), null);
});

test('3. fromGeoJsonLineString parses coordinates back into EditorPoint array', () => {
  const geojson = {
    type: 'LineString' as const,
    coordinates: [
      [90.4125, 23.8103] as [number, number],
      [90.4200, 23.8150] as [number, number],
    ],
  };

  const points = fromGeoJsonLineString(geojson);
  assert.strictEqual(points.length, 2);
  assert.strictEqual(points[0].lat, 23.8103);
  assert.strictEqual(points[0].lng, 90.4125);
  assert.strictEqual(points[1].lat, 23.815);
  assert.strictEqual(points[1].lng, 90.42);
  assert.ok(points[0].id.startsWith('pt_0_'));
  assert.ok(points[1].id.startsWith('pt_1_'));
});

test('4. fromGeoJsonLineString handles null, undefined, and non-LineString inputs safely', () => {
  assert.deepStrictEqual(fromGeoJsonLineString(null), []);
  assert.deepStrictEqual(fromGeoJsonLineString(undefined), []);
  // @ts-expect-error testing invalid structure
  assert.deepStrictEqual(fromGeoJsonLineString({ type: 'Point', coordinates: [90.4, 23.8] }), []);
});

test('5. calculatePathDistanceKm calculates haversine distance along multiple points', () => {
  const p1 = { lat: 23.8103, lng: 90.4125 };
  const p2 = { lat: 23.8150, lng: 90.4200 };
  const p3 = { lat: 23.8200, lng: 90.4250 };

  const dist0 = calculatePathDistanceKm([]);
  assert.strictEqual(dist0, 0);

  const dist1 = calculatePathDistanceKm([p1]);
  assert.strictEqual(dist1, 0);

  const dist2 = calculatePathDistanceKm([p1, p2]);
  assert.ok(dist2 > 0.8 && dist2 < 1.3); // ~0.93 km

  const dist3 = calculatePathDistanceKm([p1, p2, p3]);
  assert.ok(dist3 > dist2);
});

test('6. estimateDurationMinutes calculates estimated duration with average speed', () => {
  assert.strictEqual(estimateDurationMinutes(0), 0);
  assert.strictEqual(estimateDurationMinutes(-5), 0);
  // 25 km at 25 km/h = 1 hour = 60 mins
  assert.strictEqual(estimateDurationMinutes(25, 25), 60);
  // 12.5 km at 25 km/h = 30 mins
  assert.strictEqual(estimateDurationMinutes(12.5, 25), 30);
  // 1 km at 25 km/h = 2.4 mins -> rounded to 2 mins
  assert.strictEqual(estimateDurationMinutes(1, 25), 2);
});

test('7. validateRouteGeometry checks minimum points, bounds, and identical coordinates', () => {
  // Empty
  const emptyRes = validateRouteGeometry([]);
  assert.strictEqual(emptyRes.isValid, false);
  assert.ok(emptyRes.error?.includes('No geometry points'));

  // 1 point
  const oneRes = validateRouteGeometry([{ lat: 23.81, lng: 90.41 }]);
  assert.strictEqual(oneRes.isValid, false);
  assert.ok(oneRes.error?.includes('At least 2 points'));

  // Identical points
  const identicalRes = validateRouteGeometry([
    { lat: 23.81, lng: 90.41 },
    { lat: 23.81, lng: 90.41 },
  ]);
  assert.strictEqual(identicalRes.isValid, false);
  assert.ok(identicalRes.error?.includes('All points are identical'));

  // Out of bounds lat
  const badLatRes = validateRouteGeometry([
    { lat: 95.0, lng: 90.41 },
    { lat: 23.81, lng: 90.41 },
  ]);
  assert.strictEqual(badLatRes.isValid, false);
  assert.ok(badLatRes.error?.includes('latitude'));

  // Out of bounds lng
  const badLngRes = validateRouteGeometry([
    { lat: 23.81, lng: 195.0 },
    { lat: 23.81, lng: 90.41 },
  ]);
  assert.strictEqual(badLngRes.isValid, false);
  assert.ok(badLngRes.error?.includes('longitude'));

  // Non-numeric
  const nanRes = validateRouteGeometry([
    { lat: Number.NaN, lng: 90.41 },
    { lat: 23.81, lng: 90.41 },
  ]);
  assert.strictEqual(nanRes.isValid, false);
  assert.ok(nanRes.error?.includes('invalid non-numeric'));

  // Valid 2 points
  const validRes = validateRouteGeometry([
    { lat: 23.8103, lng: 90.4125 },
    { lat: 23.8200, lng: 90.4200 },
  ]);
  assert.strictEqual(validRes.isValid, true);
  assert.strictEqual(validRes.pointCount, 2);
  assert.ok(validRes.distanceKm > 0);
});
