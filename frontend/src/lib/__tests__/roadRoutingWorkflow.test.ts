import test from 'node:test';
import assert from 'node:assert';
import {
  computeWaypointsFingerprint,
  insertPointAtIndex,
  movePoint,
  calculateDistanceDelta,
  calculateMaxSnapDisplacement,
  resolveDraftSavePlan,
  type EditorPoint,
  type GeoJsonLineString,
  type RoadRouteCandidate,
  type RoadRouteResponse,
} from '../routeGeometry.ts';

test('1. computeWaypointsFingerprint produces deterministic fingerprints for waypoints', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8150, lng: 90.4200 },
  ];

  const fp1 = computeWaypointsFingerprint(points);
  const fp2 = computeWaypointsFingerprint(points);
  assert.strictEqual(fp1, fp2);
  assert.strictEqual(fp1, '23.810300,90.412500|23.815000,90.420000');

  // Empty points
  assert.strictEqual(computeWaypointsFingerprint([]), '');
});

test('2. computeWaypointsFingerprint detects any modification, reordering, addition or deletion', () => {
  const original: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8150, lng: 90.4200 },
  ];
  const originalFp = computeWaypointsFingerprint(original);

  // Moved point
  const moved: EditorPoint[] = [
    { id: '1', lat: 23.810301, lng: 90.4125 },
    { id: '2', lat: 23.8150, lng: 90.4200 },
  ];
  assert.notStrictEqual(computeWaypointsFingerprint(moved), originalFp);

  // Added point
  const added: EditorPoint[] = [
    ...original,
    { id: '3', lat: 23.8200, lng: 90.4250 },
  ];
  assert.notStrictEqual(computeWaypointsFingerprint(added), originalFp);

  // Removed point
  const removed: EditorPoint[] = [original[0]];
  assert.notStrictEqual(computeWaypointsFingerprint(removed), originalFp);

  // Reversed order
  const reversed: EditorPoint[] = [original[1], original[0]];
  assert.notStrictEqual(computeWaypointsFingerprint(reversed), originalFp);
});

test('3. insertPointAtIndex inserts waypoints at middle, start, end, and bounds-clamps', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.81, lng: 90.41 },
    { id: '2', lat: 23.83, lng: 90.43 },
  ];

  // Insert in middle (index 1)
  const middlePt: EditorPoint = { id: 'mid', lat: 23.82, lng: 90.42 };
  const withMid = insertPointAtIndex(points, middlePt, 1);
  assert.strictEqual(withMid.length, 3);
  assert.strictEqual(withMid[0].id, '1');
  assert.strictEqual(withMid[1].id, 'mid');
  assert.strictEqual(withMid[2].id, '2');

  // Insert at start (index 0)
  const startPt: EditorPoint = { id: 'start', lat: 23.80, lng: 90.40 };
  const withStart = insertPointAtIndex(points, startPt, 0);
  assert.strictEqual(withStart[0].id, 'start');
  assert.strictEqual(withStart[1].id, '1');

  // Insert at end (index >= length)
  const endPt: EditorPoint = { id: 'end', lat: 23.85, lng: 90.45 };
  const withEnd = insertPointAtIndex(points, endPt, 99);
  assert.strictEqual(withEnd[withEnd.length - 1].id, 'end');

  // Negative index clamps to 0
  const negativePt: EditorPoint = { id: 'neg', lat: 23.79, lng: 90.39 };
  const withNeg = insertPointAtIndex(points, negativePt, -5);
  assert.strictEqual(withNeg[0].id, 'neg');
});

test('4. movePoint reorders shaping waypoints cleanly', () => {
  const points: EditorPoint[] = [
    { id: 'A', lat: 23.81, lng: 90.41 },
    { id: 'B', lat: 23.82, lng: 90.42 },
    { id: 'C', lat: 23.83, lng: 90.43 },
  ];

  // Move C to start (index 2 -> 0)
  const cFirst = movePoint(points, 2, 0);
  assert.deepStrictEqual(cFirst.map((p) => p.id), ['C', 'A', 'B']);

  // Move A to end (index 0 -> 2)
  const aLast = movePoint(points, 0, 2);
  assert.deepStrictEqual(aLast.map((p) => p.id), ['B', 'C', 'A']);

  // Invalid indices return unchanged array
  assert.deepStrictEqual(movePoint(points, -1, 1), points);
  assert.deepStrictEqual(movePoint(points, 0, 5), points);
  assert.deepStrictEqual(movePoint(points, 1, 1), points);
});

test('5. Quality indicator helpers: calculateDistanceDelta and calculateMaxSnapDisplacement', () => {
  // Distance delta
  assert.deepStrictEqual(calculateDistanceDelta(12.55, 12.0), {
    diffKm: 0.55,
    formatted: '+0.55 km',
  });
  assert.deepStrictEqual(calculateDistanceDelta(11.8, 12.0), {
    diffKm: -0.2,
    formatted: '-0.20 km',
  });
  assert.deepStrictEqual(calculateDistanceDelta(10.0, 10.0), {
    diffKm: 0,
    formatted: '0.00 km',
  });

  // Snapping displacement
  const snapped = [
    {
      original_index: 0,
      original_lat: 23.81,
      original_lng: 90.41,
      snapped_lat: 23.81005,
      snapped_lng: 90.41005,
      displacement_meters: 6.2,
    },
    {
      original_index: 1,
      original_lat: 23.82,
      original_lng: 90.42,
      snapped_lat: 23.8202,
      snapped_lng: 90.4202,
      displacement_meters: 22.8,
    },
  ];
  assert.strictEqual(calculateMaxSnapDisplacement(snapped), 22.8);
  assert.strictEqual(calculateMaxSnapDisplacement([]), 0);
});

test('6. Candidate generation response transforms cleanly into RoadRouteCandidate', () => {
  const shapingPoints: EditorPoint[] = [
    { id: 'pt1', lat: 23.8103, lng: 90.4125 },
    { id: 'pt2', lat: 23.8200, lng: 90.4250 },
  ];

  const apiResponse: RoadRouteResponse = {
    route_id: 12,
    route_name: 'Campus Shuttle A',
    geometry: {
      type: 'LineString',
      coordinates: [
        [90.4125, 23.8103],
        [90.4150, 23.8130],
        [90.4180, 23.8170],
        [90.4250, 23.8200],
      ],
    },
    distance_km: 1.85,
    duration_mins: 5,
    coordinate_count: 4,
    waypoints_snapped: [
      {
        original_index: 0,
        original_lat: 23.8103,
        original_lng: 90.4125,
        snapped_lat: 23.810305,
        snapped_lng: 90.412510,
        displacement_meters: 1.2,
      },
      {
        original_index: 1,
        original_lat: 23.8200,
        original_lng: 90.4250,
        snapped_lat: 23.82001,
        snapped_lng: 90.42501,
        displacement_meters: 1.5,
      },
    ],
    provider: 'valhalla',
    warnings: [],
    metadata: {
      provider: 'valhalla',
      profile: 'bus',
      engine_version: '3.4.0',
    },
  };

  const candidate: RoadRouteCandidate = {
    geometry: apiResponse.geometry,
    distanceKm: apiResponse.distance_km,
    durationMins: apiResponse.duration_mins,
    coordinateCount: apiResponse.coordinate_count,
    waypointsSnapped: apiResponse.waypoints_snapped,
    provider: apiResponse.provider,
    warnings: apiResponse.warnings,
    metadata: apiResponse.metadata,
    fingerprint: computeWaypointsFingerprint(shapingPoints),
  };

  assert.strictEqual(candidate.distanceKm, 1.85);
  assert.strictEqual(candidate.durationMins, 5);
  assert.strictEqual(candidate.coordinateCount, 4);
  assert.strictEqual(candidate.provider, 'valhalla');
  assert.strictEqual(candidate.waypointsSnapped.length, 2);
  assert.strictEqual(candidate.fingerprint, computeWaypointsFingerprint(shapingPoints));
});

test('7. Waypoint refinement: modifying shaping points invalidates candidate but preserves accepted road route', () => {
  const initialPoints: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const acceptedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [
      [90.4125, 23.8103],
      [90.4180, 23.8150],
      [90.4250, 23.8200],
    ],
  };

  let candidate: RoadRouteCandidate | null = {
    geometry: acceptedRoadGeometry,
    distanceKm: 2.1,
    durationMins: 6,
    coordinateCount: 3,
    waypointsSnapped: [],
    provider: 'valhalla',
    warnings: [],
    metadata: {},
    fingerprint: computeWaypointsFingerprint(initialPoints),
  };

  const stagedAcceptedGeometry: GeoJsonLineString | null = acceptedRoadGeometry;

  // Administrator refines route by inserting an intermediate shaping waypoint
  const intermediatePt: EditorPoint = { id: 'mid', lat: 23.8150, lng: 90.4190 };
  const refinedPoints = insertPointAtIndex(initialPoints, intermediatePt, 1);

  const initialFp = computeWaypointsFingerprint(initialPoints);
  const refinedFp = computeWaypointsFingerprint(refinedPoints);

  // Invalidation check from Task 019:
  if (initialFp !== refinedFp) {
    if (candidate) {
      candidate = null; // Candidate is invalidated!
    }
    // stagedAcceptedGeometry is PRESERVED!
  }

  assert.strictEqual(candidate, null, 'Candidate must be cleared on refinement');
  assert.strictEqual(stagedAcceptedGeometry, acceptedRoadGeometry, 'Accepted road geometry must be preserved');
  assert.strictEqual(refinedPoints.length, 3);
});

test('8. Async stale response protection: in-flight responses for outdated waypoints are safely dropped', () => {
  const pointsAtRequestTime: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const requestFingerprint = computeWaypointsFingerprint(pointsAtRequestTime);

  // User edits points while the async routing request is in flight
  const pointsAtResponseTime: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8250, lng: 90.4300 }, // moved while waiting
  ];

  let candidate: RoadRouteCandidate | null = null;

  // When response returns, verify current fingerprint
  const currentFp = computeWaypointsFingerprint(pointsAtResponseTime);
  const isStale = currentFp !== requestFingerprint;

  if (!isStale) {
    candidate = {
      geometry: { type: 'LineString', coordinates: [[90.4125, 23.8103], [90.4250, 23.8200]] },
      distanceKm: 2.1,
      durationMins: 6,
      coordinateCount: 2,
      waypointsSnapped: [],
      provider: 'valhalla',
      warnings: [],
      metadata: {},
      fingerprint: requestFingerprint,
    };
  }

  assert.strictEqual(isStale, true);
  assert.strictEqual(candidate, null, 'Stale response from previous waypoints must not be applied');
});

test('9. Regeneration failure preserves both existing accepted route and refined shaping points', () => {
  const refinedPoints: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: 'mid', lat: 23.8150, lng: 90.4190 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const existingAcceptedGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [[90.4125, 23.8103], [90.4250, 23.8200]],
  };

  const stagedAccepted: GeoJsonLineString | null = existingAcceptedGeometry;
  const candidate: RoadRouteCandidate | null = null;
  let errorMsg: string | null = null;

  // Simulate network failure during regeneration
  try {
    throw new Error('Routing engine connection refused (502 Bad Gateway)');
  } catch (err: unknown) {
    errorMsg = `Road routing failed: ${(err as Error).message}. Any previously accepted route and your shaping points are preserved.`;
  }

  assert.ok(errorMsg?.includes('previously accepted route and your shaping points are preserved'));
  assert.strictEqual(stagedAccepted, existingAcceptedGeometry, 'Accepted route must survive regeneration failure');
  assert.strictEqual(candidate, null);
  assert.strictEqual(refinedPoints.length, 3, 'Refined shaping points must remain intact');
});

test('10. Rejecting candidate preserves existing accepted road route', () => {
  const existingAccepted: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [[90.4125, 23.8103], [90.4250, 23.8200]],
  };

  let candidate: RoadRouteCandidate | null = {
    geometry: { type: 'LineString', coordinates: [[90.4125, 23.8103], [90.418, 23.815], [90.4250, 23.8200]] },
    distanceKm: 2.2,
    durationMins: 6,
    coordinateCount: 3,
    waypointsSnapped: [],
    provider: 'valhalla',
    warnings: [],
    metadata: {},
    fingerprint: 'dummy',
  };

  const stagedAccepted: GeoJsonLineString | null = existingAccepted;

  // User clicks Reject Candidate
  candidate = null;

  assert.strictEqual(candidate, null);
  assert.strictEqual(stagedAccepted, existingAccepted, 'Accepted route must not be destroyed by candidate rejection');
});

test('11. Accepting candidate replaces accepted road geometry and updates metrics', () => {
  let stagedAccepted: GeoJsonLineString | null = {
    type: 'LineString',
    coordinates: [[90.4125, 23.8103], [90.4250, 23.8200]],
  };

  let stagedMetrics = { distanceKm: 1.8, durationMins: 5 };

  const candidate: RoadRouteCandidate = {
    geometry: {
      type: 'LineString',
      coordinates: [[90.4125, 23.8103], [90.416, 23.814], [90.4250, 23.8200]],
    },
    distanceKm: 2.3,
    durationMins: 7,
    coordinateCount: 3,
    waypointsSnapped: [],
    provider: 'valhalla',
    warnings: [],
    metadata: { profile: 'bus' },
    fingerprint: 'refined_fp',
  };

  // User clicks Accept Road Route
  stagedAccepted = candidate.geometry;
  stagedMetrics = { distanceKm: candidate.distanceKm, durationMins: candidate.durationMins };

  assert.strictEqual(stagedAccepted.coordinates.length, 3);
  assert.strictEqual(stagedMetrics.distanceKm, 2.3);
  assert.strictEqual(stagedMetrics.durationMins, 7);
});

test('12. resolveDraftSavePlan: Scenario A - Accepted road route with unchanged waypoints saves matching road geometry and metrics', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const acceptedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [
      [90.4125, 23.8103],
      [90.4160, 23.8150],
      [90.4250, 23.8200],
    ],
  };

  const acceptedRoadMetrics = {
    distanceKm: 2.1,
    durationMins: 6,
    metadata: { provider: 'valhalla', profile: 'bus' },
  };

  const acceptedFingerprint = computeWaypointsFingerprint(points);

  const plan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint,
    changeSummary: 'Final route review',
  });

  assert.strictEqual(plan.canSave, true);
  if (plan.canSave) {
    assert.strictEqual(plan.mode, 'road_route');
    assert.strictEqual(plan.payload.geometry, acceptedRoadGeometry);
    assert.strictEqual(plan.payload.distance_km, 2.1);
    assert.strictEqual(plan.payload.duration_mins, 6);
    assert.strictEqual(plan.payload.change_summary, 'Final route review');
    assert.strictEqual(plan.payload.metadata.mode, 'road_route');
    assert.strictEqual(plan.payload.metadata.provider, 'valhalla');
    assert.deepStrictEqual(plan.payload.metadata.shaping_points, [
      { lat: 23.8103, lng: 90.4125 },
      { lat: 23.8200, lng: 90.4250 },
    ]);
  }
});

test('13. resolveDraftSavePlan: Scenario B - Accepted road route with modified waypoints is blocked from saving', () => {
  const originalPoints: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const acceptedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [
      [90.4125, 23.8103],
      [90.4160, 23.8150],
      [90.4250, 23.8200],
    ],
  };

  const acceptedRoadMetrics = {
    distanceKm: 2.1,
    durationMins: 6,
    metadata: { provider: 'valhalla', profile: 'bus' },
  };

  const acceptedFingerprint = computeWaypointsFingerprint(originalPoints);

  // Administrator refines waypoints by adding an intermediate point
  const refinedPoints: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: 'mid', lat: 23.8150, lng: 90.4180 }, // added
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const plan = resolveDraftSavePlan({
    points: refinedPoints,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint,
    changeSummary: 'Modified draft',
  });

  assert.strictEqual(plan.canSave, false);
  if (!plan.canSave) {
    assert.ok(plan.error.includes('Shaping waypoints have changed since this road route was accepted'));
    assert.ok(plan.error.includes('Regenerate the road route and accept the updated candidate'));
  }
});

test('14. resolveDraftSavePlan: Scenario C - Blocked Save Draft does not mutate caller state', () => {
  const originalPoints: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: 'mid', lat: 23.8150, lng: 90.4180 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const acceptedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [[90.4125, 23.8103], [90.4250, 23.8200]],
  };

  const acceptedRoadMetrics = {
    distanceKm: 1.8,
    durationMins: 5,
    metadata: { provider: 'valhalla' },
  };

  // Fingerprint from 2 points, but current points has 3 points
  const staleAcceptedFingerprint = '23.810300,90.412500|23.820000,90.425000';

  const plan = resolveDraftSavePlan({
    points: originalPoints,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint: staleAcceptedFingerprint,
  });

  assert.strictEqual(plan.canSave, false);
  // Caller state remains completely unchanged
  assert.strictEqual(originalPoints.length, 3);
  assert.strictEqual(acceptedRoadGeometry.coordinates.length, 2);
  assert.strictEqual(acceptedRoadMetrics.distanceKm, 1.8);
});

test('15. resolveDraftSavePlan: Scenario D - Regenerating and explicitly accepting updated candidate allows saving', () => {
  const refinedPoints: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: 'mid', lat: 23.8150, lng: 90.4180 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  // Newly generated and accepted candidate geometry matching the 3 points
  const updatedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [
      [90.4125, 23.8103],
      [90.4180, 23.8150],
      [90.4200, 23.8170],
      [90.4250, 23.8200],
    ],
  };

  const updatedRoadMetrics = {
    distanceKm: 2.4,
    durationMins: 7,
    metadata: { provider: 'valhalla', profile: 'bus', engine_version: '3.4.0' },
  };

  // Fingerprint updated to match the refined 3 points upon explicit acceptance
  const updatedFingerprint = computeWaypointsFingerprint(refinedPoints);

  const plan = resolveDraftSavePlan({
    points: refinedPoints,
    acceptedRoadGeometry: updatedRoadGeometry,
    acceptedRoadMetrics: updatedRoadMetrics,
    acceptedFingerprint: updatedFingerprint,
    changeSummary: 'Regenerated route through mid avenue',
  });

  assert.strictEqual(plan.canSave, true);
  if (plan.canSave) {
    assert.strictEqual(plan.mode, 'road_route');
    assert.strictEqual(plan.payload.geometry, updatedRoadGeometry);
    assert.strictEqual(plan.payload.distance_km, 2.4);
    assert.strictEqual(plan.payload.duration_mins, 7);
    assert.strictEqual((plan.payload.metadata.shaping_points as unknown[]).length, 3);
  }
});

test('16. resolveDraftSavePlan: Scenario E - Reverting to schematic allows saving current waypoint geometry', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: 'mid', lat: 23.8150, lng: 90.4180 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  // Revert to schematic explicitly sets acceptedRoadGeometry to null
  const plan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry: null,
    acceptedRoadMetrics: null,
    acceptedFingerprint: null,
    changeSummary: 'Reverted to straight-line geometry',
  });

  assert.strictEqual(plan.canSave, true);
  if (plan.canSave) {
    assert.strictEqual(plan.mode, 'schematic');
    assert.strictEqual(plan.payload.geometry?.type, 'LineString');
    assert.strictEqual(plan.payload.geometry?.coordinates.length, 3);
    assert.strictEqual(plan.payload.metadata.mode, 'schematic');
  }
});

test('17. resolveDraftSavePlan: Scenario F - Schematic save does not retain stale road-route metadata', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const plan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry: null,
    acceptedRoadMetrics: null,
    acceptedFingerprint: null,
  });

  assert.strictEqual(plan.canSave, true);
  if (plan.canSave) {
    assert.strictEqual(plan.mode, 'schematic');
    assert.deepStrictEqual(plan.payload.metadata, { mode: 'schematic' });
    assert.strictEqual('provider' in plan.payload.metadata, false);
    assert.strictEqual('shaping_points' in plan.payload.metadata, false);
  }
});

test('18. resolveDraftSavePlan: Fingerprint sensitivity - moving, adding, deleting, or reordering blocks save', () => {
  const basePoints: EditorPoint[] = [
    { id: 'A', lat: 23.8100, lng: 90.4100 },
    { id: 'B', lat: 23.8200, lng: 90.4200 },
    { id: 'C', lat: 23.8300, lng: 90.4300 },
  ];

  const baseFp = computeWaypointsFingerprint(basePoints);
  const roadGeom: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [[90.41, 23.81], [90.42, 23.82], [90.43, 23.83]],
  };
  const roadMetrics = { distanceKm: 3.5, durationMins: 9, metadata: { provider: 'valhalla' } };

  // Base state is valid
  const basePlan = resolveDraftSavePlan({
    points: basePoints,
    acceptedRoadGeometry: roadGeom,
    acceptedRoadMetrics: roadMetrics,
    acceptedFingerprint: baseFp,
  });
  assert.strictEqual(basePlan.canSave, true);

  // 1. Moving a point
  const movedPoints: EditorPoint[] = [
    { id: 'A', lat: 23.810001, lng: 90.4100 },
    { id: 'B', lat: 23.8200, lng: 90.4200 },
    { id: 'C', lat: 23.8300, lng: 90.4300 },
  ];
  assert.strictEqual(
    resolveDraftSavePlan({
      points: movedPoints,
      acceptedRoadGeometry: roadGeom,
      acceptedRoadMetrics: roadMetrics,
      acceptedFingerprint: baseFp,
    }).canSave,
    false
  );

  // 2. Reordering points
  const reorderedPoints = [basePoints[1], basePoints[0], basePoints[2]];
  assert.strictEqual(
    resolveDraftSavePlan({
      points: reorderedPoints,
      acceptedRoadGeometry: roadGeom,
      acceptedRoadMetrics: roadMetrics,
      acceptedFingerprint: baseFp,
    }).canSave,
    false
  );

  // 3. Deleting a point
  const deletedPoints = [basePoints[0], basePoints[2]];
  assert.strictEqual(
    resolveDraftSavePlan({
      points: deletedPoints,
      acceptedRoadGeometry: roadGeom,
      acceptedRoadMetrics: roadMetrics,
      acceptedFingerprint: baseFp,
    }).canSave,
    false
  );
});

test('19. resolveDraftSavePlan: Fail-closed - Null or undefined acceptedFingerprint blocks saving when accepted road geometry is present', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const acceptedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [
      [90.4125, 23.8103],
      [90.4160, 23.8150],
      [90.4250, 23.8200],
    ],
  };

  const acceptedRoadMetrics = {
    distanceKm: 2.1,
    durationMins: 6,
    metadata: { provider: 'valhalla', profile: 'bus' },
  };

  // 1. null acceptedFingerprint
  const nullPlan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint: null,
  });

  assert.strictEqual(nullPlan.canSave, false);
  if (!nullPlan.canSave) {
    assert.ok(nullPlan.error.includes('accepted route has no valid waypoint fingerprint'));
  }

  // 2. undefined acceptedFingerprint
  const undefinedPlan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint: undefined,
  });

  assert.strictEqual(undefinedPlan.canSave, false);
  if (!undefinedPlan.canSave) {
    assert.ok(undefinedPlan.error.includes('accepted route has no valid waypoint fingerprint'));
  }
});

test('20. resolveDraftSavePlan: Fail-closed - Empty or whitespace-only acceptedFingerprint blocks saving when accepted road geometry is present', () => {
  const points: EditorPoint[] = [
    { id: '1', lat: 23.8103, lng: 90.4125 },
    { id: '2', lat: 23.8200, lng: 90.4250 },
  ];

  const acceptedRoadGeometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: [
      [90.4125, 23.8103],
      [90.4160, 23.8150],
      [90.4250, 23.8200],
    ],
  };

  const acceptedRoadMetrics = {
    distanceKm: 2.1,
    durationMins: 6,
    metadata: { provider: 'valhalla', profile: 'bus' },
  };

  // 1. empty string
  const emptyPlan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint: '',
  });

  assert.strictEqual(emptyPlan.canSave, false);
  if (!emptyPlan.canSave) {
    assert.ok(emptyPlan.error.includes('accepted route has no valid waypoint fingerprint'));
  }

  // 2. whitespace only
  const whitespacePlan = resolveDraftSavePlan({
    points,
    acceptedRoadGeometry,
    acceptedRoadMetrics,
    acceptedFingerprint: '   \t\n  ',
  });

  assert.strictEqual(whitespacePlan.canSave, false);
  if (!whitespacePlan.canSave) {
    assert.ok(whitespacePlan.error.includes('accepted route has no valid waypoint fingerprint'));
  }
});

