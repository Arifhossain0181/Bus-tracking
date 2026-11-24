'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Bus as BusIcon, Crosshair, Maximize2, Minimize2, Navigation, RefreshCw, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { ActiveDriverLocation, Bus, RouteItem } from '@/lib/types';
import type { StopInfo } from '@/lib/map3d/routeGeometry';
import { calculateDistanceMeters, isValidCoordinate } from '@/lib/trackingStatus';

const LiveMapView = dynamic(() => import('@/components/maps/LiveMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[620px] w-full rounded-2xl bg-slate-900 border border-slate-800 animate-pulse flex flex-col items-center justify-center text-slate-400 text-sm gap-3">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading Bus GIS 3D Map Engine (Three.js + MapLibre)...</span>
    </div>
  ),
});

function LiveMapContent() {
  const searchParams = useSearchParams();
  const initialDriverId = searchParams.get('driver_id') ? Number(searchParams.get('driver_id')) : null;

  const [drivers, setDrivers] = useState<ActiveDriverLocation[]>([]);
  const [busesList, setBusesList] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('Never');
  const [focusedDriverId, setFocusedDriverId] = useState<number | null>(initialDriverId);
  const [followingDriverId, setFollowingDriverId] = useState<number | null>(initialDriverId);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCinematic, setIsCinematic] = useState(true);
  const hasUserSelectedBusRef = useRef(false);

  // Load telemetry, fleet buses, and routes in parallel
  const fetchData = useCallback(async () => {
    try {
      const [activeData, fleetData, routesData] = await Promise.allSettled([
        apiFetch<ActiveDriverLocation[]>('/api/locations/location/active/'),
        apiFetch<Bus[]>('/api/buses/'),
        apiFetch<RouteItem[]>('/api/schedules/routes/'),
      ]);

      if (activeData.status === 'fulfilled' && Array.isArray(activeData.value)) {
        setDrivers(activeData.value);
      }
      if (fleetData.status === 'fulfilled' && Array.isArray(fleetData.value)) {
        setBusesList(fleetData.value);
      }
      if (routesData.status === 'fulfilled' && Array.isArray(routesData.value)) {
        setRoutes(routesData.value);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // 4-second polling for smooth live 3D bus interpolation
    const timer = setInterval(fetchData, 4000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Find the bus closest to the user's current GPS position
  const nearestBus = useMemo(() => {
    if (!userPosition || !isValidCoordinate(userPosition[0], userPosition[1])) return null;
    const [uLat, uLng] = userPosition;

    let closestDist = Infinity;
    let closestItem: { id: number; busNumber: string; distMeters: number } | null = null;

    // 1. Check live drivers
    drivers.forEach((d) => {
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      if (isValidCoordinate(lat, lng)) {
        const dist = calculateDistanceMeters(uLat, uLng, lat, lng);
        if (dist < closestDist) {
          closestDist = dist;
          closestItem = {
            id: d.driver_id,
            busNumber: d.bus_number ? `Bus #${d.bus_number}` : 'Live Bus',
            distMeters: dist,
          };
        }
      }
    });

    // 2. Check fleet buses
    busesList.forEach((b) => {
      const loc = b.latest_location;
      if (loc && isValidCoordinate(Number(loc.latitude), Number(loc.longitude))) {
        const dist = calculateDistanceMeters(uLat, uLng, Number(loc.latitude), Number(loc.longitude));
        if (dist < closestDist) {
          closestDist = dist;
          closestItem = {
            id: b.id + 10000,
            busNumber: `Bus #${b.bus_number}`,
            distMeters: dist,
          };
        }
      }
    });

    return closestItem;
  }, [userPosition, drivers, busesList]);

  // Auto-focus nearest bus when user position arrives (only if user hasn't manually selected one yet)
  useEffect(() => {
    if (nearestBus && !hasUserSelectedBusRef.current && focusedDriverId == null) {
      setFocusedDriverId(nearestBus.id);
      setFollowingDriverId(nearestBus.id);
    }
  }, [nearestBus, focusedDriverId]);

  // Unified list of all selectable buses with distance from user
  const allSelectableBuses = useMemo(() => {
    const list: Array<{
      id: number;
      busNumber: string;
      routeName: string;
      driverName: string;
      isLive: boolean;
      distanceKm: number | null;
    }> = [];

    const seenBusNumbers = new Set<string>();

    // 1. Live drivers
    drivers.forEach((d) => {
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      let distKm: number | null = null;
      if (userPosition && isValidCoordinate(userPosition[0], userPosition[1]) && isValidCoordinate(lat, lng)) {
        distKm = calculateDistanceMeters(userPosition[0], userPosition[1], lat, lng) / 1000;
      }
      const bNum = d.bus_number ? `Bus #${d.bus_number}` : `Bus #${d.driver_id}`;
      seenBusNumbers.add(d.bus_number || String(d.driver_id));
      list.push({
        id: d.driver_id,
        busNumber: bNum,
        routeName: d.route_name || 'IUBAT Transit Line',
        driverName: d.driver_name,
        isLive: true,
        distanceKm: distKm,
      });
    });

    // 2. Fleet buses
    busesList.forEach((b) => {
      if (seenBusNumbers.has(b.bus_number) || seenBusNumbers.has(String(b.id))) return;
      const loc = b.latest_location;
      let distKm: number | null = null;
      if (
        userPosition &&
        isValidCoordinate(userPosition[0], userPosition[1]) &&
        loc &&
        isValidCoordinate(Number(loc.latitude), Number(loc.longitude))
      ) {
        distKm = calculateDistanceMeters(userPosition[0], userPosition[1], Number(loc.latitude), Number(loc.longitude)) / 1000;
      }
      const bNum = `Bus #${b.bus_number}`;
      list.push({
        id: b.id + 10000,
        busNumber: bNum,
        routeName: b.route_name || 'IUBAT Transit Line',
        driverName: b.active_assignment?.driver_name || 'Assigned Driver',
        isLive: b.is_active && !!loc,
        distanceKm: distKm,
      });
    });

    return list;
  }, [drivers, busesList, userPosition]);

  // Determine active route and its stops for the selected or nearest bus
  const activeRoute = useMemo(() => {
    if (routes.length === 0) return null;

    // Order of precedence:
    // 1. Explicitly focused bus
    // 2. Nearest bus to user
    // 3. First available live driver or fleet bus
    const effectiveBusId =
      focusedDriverId ??
      nearestBus?.id ??
      (drivers[0]?.driver_id ?? (busesList[0]?.id ? busesList[0].id + 10000 : null));

    if (effectiveBusId != null) {
      // Check active drivers
      const activeDriver = drivers.find((d) => d.driver_id === effectiveBusId);
      if (activeDriver) {
        if (activeDriver.route_id) {
          const found = routes.find((r) => r.id === activeDriver.route_id);
          if (found) return found;
        }
        if (activeDriver.route_name) {
          const rName = activeDriver.route_name.toLowerCase().trim();
          const found = routes.find((r) => r.name.toLowerCase().trim() === rName || r.name.toLowerCase().includes(rName));
          if (found) return found;
        }
      }

      // Check fleet buses
      const fleetBus = busesList.find((b) => b.id === effectiveBusId || b.id + 10000 === effectiveBusId);
      if (fleetBus) {
        if (fleetBus.current_route) {
          const found = routes.find((r) => r.id === fleetBus.current_route);
          if (found) return found;
        }
        if (fleetBus.route_name) {
          const rName = fleetBus.route_name.toLowerCase().trim();
          const found = routes.find((r) => r.name.toLowerCase().trim() === rName || r.name.toLowerCase().includes(rName));
          if (found) return found;
        }
      }
    }

    // Fallback: pick the first route with published geometry or stops
    const routeWithGeo = routes.find((r) => (r.active_geometry?.coordinates?.length || 0) > 0 || (r.stops && r.stops.length > 0));
    return routeWithGeo || routes[0];
  }, [routes, focusedDriverId, nearestBus, drivers, busesList]);

  // Convert route stops to StopInfo[] and GeoJSON routePath
  const routeStops: StopInfo[] = useMemo(() => {
    if (!activeRoute?.stops || activeRoute.stops.length === 0) return [];
    return activeRoute.stops.map((s, idx) => ({
      id: s.id,
      name: s.name,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      order: s.order || idx + 1,
      isMajor: s.is_major_stop,
    }));
  }, [activeRoute]);

  const plannedRoadGeometry = useMemo(() => {
    const coords = activeRoute?.active_geometry?.coordinates || activeRoute?.active_revision?.geometry?.coordinates;
    return Array.isArray(coords) && coords.length >= 2 ? coords : undefined;
  }, [activeRoute]);

  const routePath: [number, number][] | undefined = useMemo(() => {
    if (plannedRoadGeometry) return plannedRoadGeometry;
    if (routeStops.length >= 2) return routeStops.map((s) => [s.longitude, s.latitude]);
    return undefined;
  }, [plannedRoadGeometry, routeStops]);

  const [locatingUser, setLocatingUser] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');

  const locateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNotice('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingUser(true);
    setLocationNotice('');

    const onPos = (pos: GeolocationPosition) => {
      setLocatingUser(false);
      setFollowingDriverId(null);
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setUserPosition(coords);
    };

    navigator.geolocation.getCurrentPosition(
      onPos,
      (err) => {
        // Fallback for indoor / mobile cellular location
        if (err.code === 2 || err.code === 3) {
          navigator.geolocation.getCurrentPosition(
            onPos,
            (fallbackErr) => {
              setLocatingUser(false);
              setLocationNotice(
                fallbackErr.code === 1
                  ? 'Location permission denied. Please allow location in your browser settings.'
                  : 'Unable to detect device location. Please check phone GPS / location services.'
              );
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        } else {
          setLocatingUser(false);
          setLocationNotice(
            err.code === 1
              ? 'Location permission denied. Please allow location in your browser settings.'
              : 'Unable to detect device location. Please enable phone GPS.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }, []);

  // Auto-detect user position on mount for live passenger marker
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPosition([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);

  const totalBusesCount = drivers.length > 0 ? drivers.length : busesList.length;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Live 3D Bus Map</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-700 border border-cyan-500/20">
              <Sparkles className="w-3 h-3 text-cyan-600" />
              Bus GIS Map
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalBusesCount} bus{totalBusesCount === 1 ? '' : 'es'} in tracking fleet &middot; Live GPS sync: {lastUpdated}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Bus Selector Dropdown */}
          {allSelectableBuses.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm">
              <BusIcon className="w-4 h-4 text-cyan-600 shrink-0" />
              <select
                aria-label="Select Bus to Track"
                value={focusedDriverId ?? nearestBus?.id ?? allSelectableBuses[0]?.id ?? ''}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) {
                    hasUserSelectedBusRef.current = true;
                    setFocusedDriverId(val);
                    setFollowingDriverId(val);
                  }
                }}
                className="bg-transparent text-slate-800 text-xs sm:text-sm font-bold focus:outline-none cursor-pointer max-w-[180px] sm:max-w-[260px] truncate"
              >
                {allSelectableBuses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.busNumber} ({b.routeName}) {b.distanceKm != null ? `• ${b.distanceKm.toFixed(1)}km` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 2. Nearest Bus Shortcut Pill */}
          {nearestBus && (
            <button
              type="button"
              onClick={() => {
                hasUserSelectedBusRef.current = true;
                setFocusedDriverId(nearestBus.id);
                setFollowingDriverId(nearestBus.id);
              }}
              title="Focus on the bus closest to your current location"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 border transition ${
                focusedDriverId === nearestBus.id
                  ? 'bg-cyan-500/20 text-cyan-900 border-cyan-400'
                  : 'bg-white hover:bg-cyan-50 text-slate-700 border-slate-300'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-cyan-600" />
              <span>Nearest: {nearestBus.busNumber}</span>
              <span className="text-[10px] text-slate-500">
                ({nearestBus.distMeters < 1000 ? `${Math.round(nearestBus.distMeters)}m` : `${(nearestBus.distMeters / 1000).toFixed(1)}km`})
              </span>
            </button>
          )}

          {/* Cinematic Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsCinematic(!isCinematic)}
            className={`px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition ${
              isCinematic
                ? 'bg-slate-900 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isCinematic ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isCinematic ? 'Exit Cinematic' : 'Full 3D Mode'}
          </button>

          <button
            type="button"
            onClick={locateMe}
            disabled={locatingUser}
            className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Crosshair className={`w-4 h-4 text-blue-600 ${locatingUser ? 'animate-spin' : ''}`} />
            {locatingUser ? 'Locating...' : 'My Location'}
          </button>

          <button
            type="button"
            onClick={fetchData}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {locationNotice && (
        <div className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center justify-between">
          <span>{locationNotice}</span>
          <button type="button" onClick={() => setLocationNotice('')} className="font-bold ml-2 hover:text-amber-950">×</button>
        </div>
      )}

      {/* Main Map Layout */}
      <div className={`grid gap-4 transition-all ${isCinematic ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-4'}`}>
        <div className={isCinematic ? 'w-full' : 'lg:col-span-3'}>
          <LiveMapView
            drivers={drivers}
            busesList={busesList}
            routePath={routePath}
            roadGeometry={plannedRoadGeometry}
            stops={routeStops}
            routeName={activeRoute?.name || 'Main Campus Transit Line'}
            originName={activeRoute?.origin_name || 'Main Campus Station'}
            destinationName={activeRoute?.destination_name || 'City Express Terminal'}
            userPosition={userPosition}
            focusedDriverId={focusedDriverId}
            followingDriverId={followingDriverId}
            onSelectDriver={(id) => {
              hasUserSelectedBusRef.current = true;
              setFocusedDriverId(id);
              setFollowingDriverId(id);
            }}
            heightClass={isCinematic ? 'h-[calc(100vh-180px)]' : 'h-[640px]'}
          />
        </div>

        {/* Sidebar (hidden in cinematic mode) */}
        {!isCinematic && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-sm flex items-center justify-between">
                <span>Fleet Buses</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-100 text-cyan-800 font-bold">
                  {totalBusesCount} Total
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {loading ? (
                  <div className="p-4 text-sm text-slate-500 text-center">Loading active buses...</div>
                ) : drivers.length === 0 && busesList.length === 0 ? (
                  <div className="p-5 text-center text-sm text-slate-500">
                    No buses are currently sharing live GPS.
                  </div>
                ) : (
                  <>
                    {/* Active live drivers */}
                    {drivers.map((d) => {
                      const isFollowing = followingDriverId === d.driver_id;
                      const speedKmh = d.speed != null ? Math.round(d.speed * 3.6) : 0;
                      return (
                        <div key={d.driver_id} className="p-3 hover:bg-slate-50 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              hasUserSelectedBusRef.current = true;
                              setFocusedDriverId(d.driver_id);
                              setFollowingDriverId(d.driver_id);
                            }}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                <BusIcon className="w-4 h-4 text-cyan-600" />
                                {d.bus_number ? `Bus #${d.bus_number}` : 'Bus'}
                              </span>
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                {speedKmh} km/h
                              </span>
                            </div>
                            <p className="text-xs text-blue-700 font-medium mt-0.5">
                              {d.route_name || 'Campus Line'}
                            </p>
                            <p className="text-xs text-slate-500">Driver: {d.driver_name}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              hasUserSelectedBusRef.current = true;
                              setFollowingDriverId(isFollowing ? null : d.driver_id);
                              setFocusedDriverId(d.driver_id);
                            }}
                            className={`w-full py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition ${
                              isFollowing
                                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/25'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            {isFollowing ? 'Tracking Bus (3D Lock)' : 'Follow in 3D'}
                          </button>
                        </div>
                      );
                    })}

                    {/* Fleet buses on standby */}
                    {busesList.slice(0, 5).map((b) => {
                      if (drivers.some((d) => d.bus_number === b.bus_number)) return null;
                      const isFocused = focusedDriverId === b.id + 10000;
                      return (
                        <div
                          key={b.id}
                          className={`p-3 hover:bg-slate-50 space-y-1 transition ${
                            isFocused ? 'bg-cyan-50/70 border-l-2 border-cyan-500' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              hasUserSelectedBusRef.current = true;
                              setFocusedDriverId(b.id + 10000);
                              setFollowingDriverId(b.id + 10000);
                            }}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                                <BusIcon className="w-4 h-4 text-slate-400" />
                                Bus #{b.bus_number}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {b.is_active ? 'STANDBY' : 'OFFLINE'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              {b.route_name ? `Route: ${b.route_name}` : 'Unassigned Route'} &middot; Reg: {b.license_plate}
                            </p>
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Quick 3D Navigation Guide */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-md text-xs space-y-2.5 border border-slate-700/60">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-cyan-300">3D Camera Controls</h3>
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
                  WebGL
                </span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li>&bull; <strong className="text-white">Rotate:</strong> Right-click + drag or Ctrl + drag</li>
                <li>&bull; <strong className="text-white">Tilt (Pitch):</strong> 2D/3D toggle or Shift + drag</li>
                <li>&bull; <strong className="text-white">Zoom:</strong> Mouse scroll or +/- toolbar buttons</li>
                <li>&bull; <strong className="text-white">2D / 3D:</strong> Tap &quot;3D&quot; pill at top-right</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveMapPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading live map...</div>}>
      <LiveMapContent />
    </Suspense>
  );
}
