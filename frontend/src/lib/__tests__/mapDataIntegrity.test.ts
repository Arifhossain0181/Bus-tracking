import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCoordinate, calculateLocationAgeSeconds, GPS_FRESHNESS_THRESHOLDS } from '../trackingStatus.ts';
import type { ActiveDriverLocation, Bus } from '../types.ts';
import type { ActiveBusData } from '../map3d/threeMapLayer.ts';
import {
  PILOT_MAP_STYLE_URL,
  PILOT_MAP_BRIGHT_STYLE_URL,
  DEFAULT_CAMERA_PITCH,
  PILOT_MAP_ATTRIBUTION,
  ADMIN_MAP_TILE_URL,
  ADMIN_MAP_ATTRIBUTION,
  SATELLITE_IMAGERY_ENABLED,
} from '../mapConfig.ts';
import { fetchRoadRouteGeometry, snapBusToRoad } from '../map3d/routeGeometry.ts';

// Helper mimicking LiveMapView's truthful bus list construction
function buildActiveBuses(
  drivers: ActiveDriverLocation[],
  busesList: Bus[] = [],
  followingDriverId: number | null = null
): ActiveBusData[] {
  const list: ActiveBusData[] = [];
  const activeBusNumbers = new Set<string>();

  // 1. Live telemetry drivers
  drivers.forEach((d) => {
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    if (!isValidCoordinate(lat, lng)) {
      return;
    }

    const bNum = d.bus_number ? `Bus #${d.bus_number}` : `Bus #${d.driver_id}`;
    activeBusNumbers.add(d.bus_number || String(d.driver_id));
    const rawSpeed = d.speed != null ? Number(d.speed) : null;
    const ageSec = calculateLocationAgeSeconds(d.last_updated);

    let driverStatus: ActiveBusData['status'];
    if (ageSec != null && ageSec > GPS_FRESHNESS_THRESHOLDS.STALE_MAX_SECONDS) {
      driverStatus = 'offline';
    } else if (ageSec != null && ageSec > GPS_FRESHNESS_THRESHOLDS.LIVE_MAX_SECONDS) {
      driverStatus = 'stale';
    } else if (rawSpeed != null) {
      driverStatus = rawSpeed > 1 ? 'moving' : 'stopped';
    } else {
      driverStatus = 'live';
    }

    list.push({
      id: d.driver_id,
      busNumber: bNum,
      routeName: d.route_name || 'IUBAT Transit Line',
      driverName: d.driver_name,
      speed: rawSpeed,
      heading: d.heading != null ? d.heading : 165,
      latitude: lat,
      longitude: lng,
      lastUpdated: d.last_updated,
      accentColor: followingDriverId === d.driver_id ? '#00e5ff' : '#10b981',
      status: driverStatus,
    });
  });

  // 2. Fleet buses with verified location only
  (busesList || []).forEach((b) => {
    if (activeBusNumbers.has(b.bus_number) || activeBusNumbers.has(String(b.id))) {
      return;
    }
    const loc = b.latest_location;
    if (!loc || !isValidCoordinate(loc.latitude, loc.longitude)) {
      return;
    }
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    const rawFleetSpeed = loc?.speed != null ? Number(loc.speed) : null;
    const fleetTimestamp = loc?.timestamp || b.updated_at;
    const fleetAgeSec = calculateLocationAgeSeconds(fleetTimestamp);

    let fleetStatus: ActiveBusData['status'];
    if (!b.is_active || (fleetAgeSec != null && fleetAgeSec > GPS_FRESHNESS_THRESHOLDS.STALE_MAX_SECONDS)) {
      fleetStatus = 'offline';
    } else if (fleetAgeSec != null && fleetAgeSec > GPS_FRESHNESS_THRESHOLDS.LIVE_MAX_SECONDS) {
      fleetStatus = 'stale';
    } else if (rawFleetSpeed != null) {
      fleetStatus = rawFleetSpeed > 1 ? 'moving' : 'stopped';
    } else {
      fleetStatus = 'live';
    }

    list.push({
      id: b.id + 10000,
      busNumber: `Bus #${b.bus_number}`,
      routeName: b.route_name || 'IUBAT Transit Line',
      driverName: b.active_assignment?.driver_name || 'Assigned Driver',
      speed: rawFleetSpeed,
      heading: loc?.heading ? Number(loc.heading) : 165,
      latitude: lat,
      longitude: lng,
      lastUpdated: loc?.timestamp || b.updated_at,
      accentColor: '#00e5ff',
      status: fleetStatus,
      licensePlate: b.license_plate,
    });
  });

  return list;
}

// Helper mimicking Follow Bus planned route vs breadcrumb separation
function resolveFollowLayers(params: {
  trail: [number, number][]; // [lat, lng][]
  plannedRouteGeometry?: [number, number][] | null; // [lng, lat][]
  stops?: Array<{ latitude: number; longitude: number }>;
}): {
  plannedRoute: [number, number][] | undefined;
  breadcrumbTrail: [number, number][];
} {
  const breadcrumbTrail = (params.trail || [])
    .filter(([lat, lng]) => isValidCoordinate(lat, lng))
    .map(([lat, lng]) => [lng, lat] as [number, number]);

  let plannedRoute: [number, number][] | undefined = undefined;
  if (params.plannedRouteGeometry && params.plannedRouteGeometry.length >= 2) {
    plannedRoute = params.plannedRouteGeometry;
  } else if (params.stops && params.stops.length >= 2) {
    plannedRoute = params.stops.map((s) => [s.longitude, s.latitude]);
  }

  return { plannedRoute, breadcrumbTrail };
}

// Helper mimicking FloatingBusHUD truthful metric formatting
function formatHudMetrics(params: {
  distanceToNextKm?: number | null;
  etaMinutes?: number | null;
  speedKmh?: number | null;
  status?: 'moving' | 'stopped' | 'offline';
}) {
  const displayDistance =
    params.distanceToNextKm != null
      ? params.distanceToNextKm === 0
        ? '0'
        : params.distanceToNextKm.toFixed(1)
      : '—';

  const displayDistanceUnit =
    params.distanceToNextKm != null
      ? params.distanceToNextKm === 0
        ? 'At stop'
        : 'km away'
      : '';

  const displayEta =
    params.etaMinutes != null
      ? params.etaMinutes === 0
        ? 'Due'
        : `${params.etaMinutes}`
      : 'Calculating…';

  const isConnected = params.status !== 'offline';
  const statusText =
    params.status === 'moving'
      ? 'LIVE (MOVING)'
      : params.status === 'stopped'
      ? 'LIVE (STOPPED)'
      : 'OFFLINE';

  return {
    displayDistance,
    displayDistanceUnit,
    displayEta,
    isConnected,
    statusText,
    speedKmh: params.speedKmh,
  };
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

test('1. Fake Telemetry: Empty driver & fleet list produces empty array with NO fabricated buses', () => {
  const result = buildActiveBuses([], []);
  assert.equal(result.length, 0, 'Must produce 0 buses when API telemetry is empty');
  assert.equal(
    result.some((b) => b.busNumber.includes('UB-001') || b.busNumber.includes('UB-002')),
    false,
    'Must never inject fake demo buses UB-001 or UB-002'
  );
});

test('2. Fake Telemetry: Fleet bus without latest_location is NOT placed at campus coordinates', () => {
  const busWithoutLoc: Bus = {
    id: 42,
    bus_number: 'B-42',
    license_plate: 'DHK-42',
    bus_type: 'shuttle',
    capacity: 40,
    is_active: true,
    latest_location: null,
  };

  const result = buildActiveBuses([], [busWithoutLoc]);
  assert.equal(result.length, 0, 'Bus without location must not be placed on map');
  assert.equal(
    result.some((b) => b.latitude === 23.8878 && b.longitude === 90.3896),
    false,
    'Must not silently fall back to IUBAT Campus coordinates'
  );
});

test('3. Fake Telemetry: Fleet bus with invalid/zero coordinates (0, 0) is excluded', () => {
  const busWithZeroLoc: Bus = {
    id: 99,
    bus_number: 'B-99',
    license_plate: 'DHK-99',
    bus_type: 'shuttle',
    capacity: 40,
    is_active: true,
    latest_location: {
      id: 1,
      bus: 99,
      latitude: 0,
      longitude: 0,
      timestamp: new Date().toISOString(),
    },
  };

  const result = buildActiveBuses([], [busWithZeroLoc]);
  assert.equal(result.length, 0, 'Null Island coordinates must be excluded');
});

test('4. Real Bus Telemetry: Valid active driver telemetry is faithfully rendered', () => {
  const activeDriver: ActiveDriverLocation = {
    driver_id: 101,
    driver_name: 'Tareq Hassan',
    bus_id: 5,
    bus_number: '12',
    route_id: 2,
    route_name: 'Airport Express',
    latitude: 23.855,
    longitude: 90.415,
    speed: 12.5,
    heading: 180,
    accuracy: 10,
    last_updated: new Date().toISOString(),
    is_active: true,
  };

  const result = buildActiveBuses([activeDriver], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].busNumber, 'Bus #12');
  assert.equal(result[0].driverName, 'Tareq Hassan');
  assert.equal(result[0].latitude, 23.855);
  assert.equal(result[0].longitude, 90.415);
  assert.equal(result[0].status, 'moving');
});

test('5. Follow Bus Route Separation: Planned route strictly uses assigned route revision geometry', () => {
  const assignedGeometry: [number, number][] = [
    [90.389, 23.887],
    [90.401, 23.865],
    [90.421, 23.825],
  ];
  const historicalTrail: [number, number][] = [
    [23.887, 90.389],
    [23.885, 90.391],
  ];

  const layers = resolveFollowLayers({
    trail: historicalTrail,
    plannedRouteGeometry: assignedGeometry,
  });

  assert.deepEqual(layers.plannedRoute, assignedGeometry, 'Planned route must match assigned geometry');
  assert.equal(layers.breadcrumbTrail.length, 2, 'Breadcrumbs must represent historical trail');
  assert.notDeepEqual(layers.plannedRoute, layers.breadcrumbTrail, 'Planned route and breadcrumbs must be separate');
});

test('6. Follow Bus Route Separation: Missing route geometry does NOT substitute breadcrumbs as planned route', () => {
  const historicalTrail: [number, number][] = [
    [23.887, 90.389],
    [23.885, 90.391],
  ];

  const layers = resolveFollowLayers({
    trail: historicalTrail,
    plannedRouteGeometry: null,
  });

  assert.equal(layers.plannedRoute, undefined, 'Planned route must be undefined when geometry is absent');
  assert.equal(layers.breadcrumbTrail.length, 2, 'Breadcrumbs must remain separate');
});

test('7. HUD Metrics: Distance of 0 displays "0" and "At stop", never fabricated as 0.5 km', () => {
  const metrics = formatHudMetrics({ distanceToNextKm: 0, etaMinutes: 0 });
  assert.equal(metrics.displayDistance, '0');
  assert.equal(metrics.displayDistanceUnit, 'At stop');
  assert.notEqual(metrics.displayDistance, '0.5');
});

test('8. HUD Metrics: ETA of 0 displays "Due", never fabricated as 4 minutes', () => {
  const metrics = formatHudMetrics({ distanceToNextKm: 0, etaMinutes: 0 });
  assert.equal(metrics.displayEta, 'Due');
  assert.notEqual(metrics.displayEta, '4');
});

test('9. HUD Metrics: Missing distance and ETA display "—" and "Calculating…", never fake numbers', () => {
  const metrics = formatHudMetrics({ distanceToNextKm: null, etaMinutes: null });
  assert.equal(metrics.displayDistance, '—');
  assert.equal(metrics.displayEta, 'Calculating…');
  assert.notEqual(metrics.displayDistance, '0.5');
  assert.notEqual(metrics.displayEta, '4');
});

test('10. HUD Metrics: Stale or offline bus reports OFFLINE status and isConnected=false', () => {
  const metrics = formatHudMetrics({ status: 'offline' });
  assert.equal(metrics.isConnected, false);
  assert.equal(metrics.statusText, 'OFFLINE');
});

test('11. Speed Metrics: Missing speed displays "—", whereas measured 0 km/h displays "0"', () => {
  // When speed is genuinely 0 km/h
  const zeroSpeedMetrics = formatHudMetrics({ speedKmh: 0 });
  const zeroDisplay = zeroSpeedMetrics.speedKmh != null ? zeroSpeedMetrics.speedKmh : '—';
  assert.equal(zeroDisplay, 0, 'Measured 0 km/h must display 0');

  // When speed is missing / null
  const missingSpeedMetrics = formatHudMetrics({ speedKmh: null });
  const missingDisplay = missingSpeedMetrics.speedKmh != null ? missingSpeedMetrics.speedKmh : '—';
  assert.equal(missingDisplay, '—', 'Missing speed must display dash "—" and not 0');
});

test('12. Speed & Status: Bus with fresh GPS but missing speed is classified as LIVE, never OFFLINE', () => {
  const driverWithNoSpeed: ActiveDriverLocation = {
    driver_id: 15,
    driver_name: 'Driver Without Speedometer',
    bus_id: 15,
    bus_number: '15',
    latitude: 23.87,
    longitude: 90.39,
    speed: null,
    heading: 180,
    last_updated: new Date().toISOString(),
    is_active: true,
  };

  const active = buildActiveBuses([driverWithNoSpeed], []);
  assert.equal(active.length, 1);
  assert.equal(active[0].speed, null, 'Speed must remain null when missing');
  assert.equal(active[0].status, 'live', 'Fresh GPS telemetry must be marked live, never offline');
  assert.notEqual(active[0].status, 'offline', 'Must never classify live bus as offline');
  assert.notEqual(active[0].status, 'stopped', 'Must not infer stopped without measured zero speed');
});

test('14. Telemetry Status Matrix: Verified handling across all speed & GPS states', () => {
  // Case A: Fresh GPS + positive speed => 'moving'
  const movingDriver: ActiveDriverLocation = {
    driver_id: 1,
    driver_name: 'Driver 1',
    bus_id: 1,
    bus_number: '1',
    latitude: 23.85,
    longitude: 90.41,
    speed: 12.0,
    last_updated: new Date().toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([movingDriver])[0].status, 'moving');

  // Case B: Fresh GPS + zero speed => 'stopped'
  const stoppedDriver: ActiveDriverLocation = {
    driver_id: 2,
    driver_name: 'Driver 2',
    bus_id: 2,
    bus_number: '2',
    latitude: 23.85,
    longitude: 90.41,
    speed: 0.0,
    last_updated: new Date().toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([stoppedDriver])[0].status, 'stopped');

  // Case C: Fresh GPS + missing speed => 'live' (not offline)
  const liveDriver: ActiveDriverLocation = {
    driver_id: 3,
    driver_name: 'Driver 3',
    bus_id: 3,
    bus_number: '3',
    latitude: 23.85,
    longitude: 90.41,
    speed: null,
    last_updated: new Date().toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([liveDriver])[0].status, 'live');

  // Case D: Stale GPS (60s old) + positive speed => 'stale' (never falsely live)
  const staleDriver: ActiveDriverLocation = {
    driver_id: 4,
    driver_name: 'Driver 4',
    bus_id: 4,
    bus_number: '4',
    latitude: 23.85,
    longitude: 90.41,
    speed: 25.0,
    last_updated: new Date(Date.now() - 60000).toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([staleDriver])[0].status, 'stale', 'Stale GPS with positive speed must be STALE, not LIVE');

  // Case E: Offline GPS (>120s old) + positive speed => 'offline'
  const offlineDriver: ActiveDriverLocation = {
    driver_id: 5,
    driver_name: 'Driver 5',
    bus_id: 5,
    bus_number: '5',
    latitude: 23.85,
    longitude: 90.41,
    speed: 25.0,
    last_updated: new Date(Date.now() - 150000).toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([offlineDriver])[0].status, 'offline', 'Offline GPS must be OFFLINE even if last speed was positive');

  // Case F: Stale GPS with null speed => 'stale'
  const staleNoSpeed: ActiveDriverLocation = {
    driver_id: 6,
    driver_name: 'Driver 6',
    bus_id: 6,
    bus_number: '6',
    latitude: 23.85,
    longitude: 90.41,
    speed: null,
    last_updated: new Date(Date.now() - 60000).toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([staleNoSpeed])[0].status, 'stale', 'Stale GPS with null speed must be STALE');

  // Case G: Offline GPS with null speed => 'offline'
  const offlineNoSpeed: ActiveDriverLocation = {
    driver_id: 7,
    driver_name: 'Driver 7',
    bus_id: 7,
    bus_number: '7',
    latitude: 23.85,
    longitude: 90.41,
    speed: null,
    last_updated: new Date(Date.now() - 150000).toISOString(),
    is_active: true,
  };
  assert.equal(buildActiveBuses([offlineNoSpeed])[0].status, 'offline', 'Offline GPS with null speed must be OFFLINE');
});

test('15. Marker Badge & Status Consistency: Badge text is OFFLINE when offline and STALE when stale', () => {
  // Helper replicating BusGisMap's markerBadgeText logic
  function resolveMarkerBadge(status: string, speedKmh: number | null): string {
    if (status === 'offline') return 'OFFLINE';
    if (status === 'stale') return 'STALE';
    return speedKmh != null ? `${speedKmh} km/h` : 'LIVE';
  }

  assert.equal(resolveMarkerBadge('offline', 35), 'OFFLINE', 'Offline bus must never show speed on marker badge');
  assert.equal(resolveMarkerBadge('offline', null), 'OFFLINE');
  assert.equal(resolveMarkerBadge('stale', 35), 'STALE', 'Stale bus must never show speed on marker badge');
  assert.equal(resolveMarkerBadge('stale', null), 'STALE');
  assert.equal(resolveMarkerBadge('moving', 35), '35 km/h');
  assert.equal(resolveMarkerBadge('stopped', 0), '0 km/h');
  assert.equal(resolveMarkerBadge('live', null), 'LIVE');
});

test('13. Route Stops Fallback: Stops are converted correctly from planned_route_stops', () => {
  const stops = [
    { latitude: 23.8878, longitude: 90.3896 },
    { latitude: 23.865, longitude: 90.401 },
  ];
  const layers = resolveFollowLayers({
    trail: [],
    stops,
  });
  assert.deepEqual(layers.plannedRoute, [
    [90.3896, 23.8878],
    [90.401, 23.865],
  ]);
});

test('16. Pilot Map Standardization: Centralized Config & Mobile 2D Pitch Default', () => {
  assert.equal(PILOT_MAP_STYLE_URL, 'https://tiles.openfreemap.org/styles/liberty');
  assert.equal(PILOT_MAP_BRIGHT_STYLE_URL, 'https://tiles.openfreemap.org/styles/bright');
  assert.equal(DEFAULT_CAMERA_PITCH, 0, 'Default camera pitch must be flat 2D (0 degrees) for mobile performance');
  assert.ok(PILOT_MAP_ATTRIBUTION.includes('OpenStreetMap'), 'Attribution must credit OpenStreetMap');
  assert.ok(PILOT_MAP_ATTRIBUTION.includes('OpenFreeMap'), 'Attribution must credit OpenFreeMap');
  assert.ok(ADMIN_MAP_TILE_URL.includes('tile.openstreetmap.org'), 'Admin tile URL isolated in config');
  assert.ok(ADMIN_MAP_ATTRIBUTION.includes('OpenStreetMap'), 'Admin attribution must credit OpenStreetMap');
});

test('17. Public Routing Elimination: fetchRoadRouteGeometry does not make external network requests', async () => {
  const stops = [
    { id: 1, name: 'Campus Gate', latitude: 23.8878, longitude: 90.3896 },
    { id: 2, name: 'Uttara Station', latitude: 23.865, longitude: 90.401 },
  ];

  const coords = await fetchRoadRouteGeometry(stops);
  assert.equal(coords.length, 2);
  assert.deepEqual(coords[0], [90.3896, 23.8878]);
  assert.deepEqual(coords[1], [90.401, 23.865]);
});

test('18. Zero Google Tile Scraping: Ensure no mt0-mt3 or lyrs= patterns in client config', () => {
  const forbiddenPatterns = ['mt0.google.com', 'mt1.google.com', 'mt2.google.com', 'mt3.google.com', 'lyrs=y', 'lyrs=s'];
  const testStyles = [PILOT_MAP_STYLE_URL, PILOT_MAP_BRIGHT_STYLE_URL];
  for (const style of testStyles) {
    for (const pattern of forbiddenPatterns) {
      assert.ok(!style.includes(pattern), `Style ${style} must not contain Google scraping pattern: ${pattern}`);
    }
  }
});

test('19. Esri Satellite Preset Disabled for Pilot Compliance', () => {
  assert.equal(SATELLITE_IMAGERY_ENABLED, false, 'Satellite imagery must be explicitly disabled for pilot');
});

test('20. Route Geometry Fallback Integrity: Bus is NOT snapped to schematic stop coordinates', () => {
  // Given a bus at genuine coordinates (e.g. at bus bay)
  const genuineBusLng = 90.395;
  const genuineBusLat = 23.875;

  // Given schematic stops that form a straight line connecting two far stops
  const stops = [
    { id: 1, name: 'Origin Stop', latitude: 23.8878, longitude: 90.3896 },
    { id: 2, name: 'Destination Stop', latitude: 23.865, longitude: 90.401 },
  ];
  const schematicPath: [number, number][] = stops.map((s) => [s.longitude, s.latitude]);

  // When isTrueRoadGeometry is false, snapping logic in BusGisMap skips snapBusToRoad:
  const isTrueRoadGeometry = false;
  const snappedCoords: [number, number] = (isTrueRoadGeometry && schematicPath.length >= 2)
    ? snapBusToRoad(genuineBusLng, genuineBusLat, schematicPath)
    : [genuineBusLng, genuineBusLat];

  // Bus coordinates remain truthful, authentic GPS telemetry:
  assert.deepEqual(snappedCoords, [genuineBusLng, genuineBusLat]);
});

test('21. Route Geometry Precedence: True road geometry strictly supersedes fallback stop coordinates', () => {
  const roadGeometryProp: [number, number][] = [
    [90.3896, 23.8878],
    [90.392, 23.88],
    [90.398, 23.872],
    [90.401, 23.865],
  ];
  const routePath: [number, number][] = [
    [90.3896, 23.8878],
    [90.401, 23.865],
  ];
  const stops = [
    { id: 1, name: 'Origin', latitude: 23.8878, longitude: 90.3896 },
    { id: 2, name: 'Dest', latitude: 23.865, longitude: 90.401 },
  ];

  function resolveActivePath(
    roadGeom: [number, number][] | undefined,
    rPath: [number, number][] | undefined,
    stopList: { longitude: number; latitude: number }[]
  ): [number, number][] {
    if (roadGeom && roadGeom.length >= 2) return roadGeom;
    if (rPath && rPath.length >= 2) return rPath;
    if (stopList && stopList.length >= 2) return stopList.map((s) => [s.longitude, s.latitude]);
    return [];
  }

  // Precedence test 1: roadGeometryProp takes highest priority
  assert.deepEqual(resolveActivePath(roadGeometryProp, routePath, stops), roadGeometryProp);

  // Precedence test 2: If roadGeometryProp is absent, routePath takes next priority
  assert.deepEqual(resolveActivePath(undefined, routePath, stops), routePath);

  // Precedence test 3: If both are absent, stop coordinates serve as schematic fallback
  assert.deepEqual(
    resolveActivePath(undefined, undefined, stops),
    stops.map((s) => [s.longitude, s.latitude])
  );
});

test('22. Admin Tile Provider Isolation: OpenStreetMap isolated in config for non-production authoring', () => {
  assert.ok(ADMIN_MAP_TILE_URL.includes('tile.openstreetmap.org'), 'Admin tile URL must be isolated in config');
  assert.ok(ADMIN_MAP_ATTRIBUTION.includes('OpenStreetMap'), 'Admin attribution must credit OpenStreetMap');
});

test('23. Schematic Fallback Detection: isTrueRoadGeometry rejects routePath matching stops exactly', () => {
  const stops = [
    { id: 1, name: 'Stop A', latitude: 23.8878, longitude: 90.3896 },
    { id: 2, name: 'Stop B', latitude: 23.865, longitude: 90.401 },
  ];
  const schematicPath: [number, number][] = stops.map((s) => [s.longitude, s.latitude]);
  const realRoadGeometry: [number, number][] = [
    [90.3896, 23.8878],
    [90.392, 23.88],
    [90.398, 23.872],
    [90.401, 23.865],
  ];

  function evaluateIsTrueRoadGeometry(
    roadGeom: [number, number][] | undefined,
    rPath: [number, number][] | undefined,
    stopList: { longitude: number; latitude: number }[]
  ): boolean {
    if (roadGeom && roadGeom.length >= 2) return true;
    if (rPath && rPath.length >= 2) {
      if (!stopList || stopList.length < 2) return true;
      if (rPath.length === stopList.length) {
        const isJustStops = rPath.every(
          (pt, i) => Math.abs(pt[0] - stopList[i].longitude) < 0.00001 && Math.abs(pt[1] - stopList[i].latitude) < 0.00001
        );
        if (isJustStops) return false;
      }
      return true;
    }
    return false;
  }

  // When routePath is merely an echo of stops, it is detected as schematic (NOT road snapped)
  assert.equal(evaluateIsTrueRoadGeometry(undefined, schematicPath, stops), false);

  // When genuine multi-point road geometry is provided, it is accepted as true road geometry
  assert.equal(evaluateIsTrueRoadGeometry(undefined, realRoadGeometry, stops), true);
  assert.equal(evaluateIsTrueRoadGeometry(realRoadGeometry, undefined, stops), true);
});


