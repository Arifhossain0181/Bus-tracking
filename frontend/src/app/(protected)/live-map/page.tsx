'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Bus as BusIcon, Crosshair, Maximize2, Minimize2, Navigation, RefreshCw, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { ActiveDriverLocation, Bus, RouteItem } from '@/lib/types';
import type { StopInfo } from '@/lib/map3d/routeGeometry';

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

  // Determine active route and its stops for the selected bus
  const activeRoute = useMemo(() => {
    if (routes.length === 0) return null;

    // Check if focused driver has a matching route
    if (focusedDriverId != null) {
      const activeDriver = drivers.find((d) => d.driver_id === focusedDriverId);
      if (activeDriver?.route_id) {
        const rId = activeDriver.route_id;
        const found = routes.find((r) => r.id === rId);
        if (found) return found;
      }
      if (activeDriver?.route_name) {
        const rName = activeDriver.route_name.toLowerCase();
        const found = routes.find((r) => r.name.toLowerCase() === rName);
        if (found) return found;
      }

      // Check fleet bus matching focused id
      const fleetBus = busesList.find((b) => b.id === focusedDriverId || b.id + 10000 === focusedDriverId);
      if (fleetBus?.current_route) {
        const rId = fleetBus.current_route;
        const found = routes.find((r) => r.id === rId);
        if (found) return found;
      }
    }

    return routes[0];
  }, [routes, focusedDriverId, drivers, busesList]);

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

  const routePath: [number, number][] = useMemo(() => {
    return routeStops.map((s) => [s.longitude, s.latitude]);
  }, [routeStops]);

  const locateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFollowingDriverId(null);
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {},
      { enableHighAccuracy: true }
    );
  };

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

        <div className="flex items-center gap-2">
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
            className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Crosshair className="w-4 h-4 text-blue-600" />
            My Location
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

      {/* Main Map Layout */}
      <div className={`grid gap-4 transition-all ${isCinematic ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-4'}`}>
        <div className={isCinematic ? 'w-full' : 'lg:col-span-3'}>
          <LiveMapView
            drivers={drivers}
            busesList={busesList}
            routePath={routePath.length > 0 ? routePath : undefined}
            stops={routeStops}
            routeName={activeRoute?.name || 'Main Campus Transit Line'}
            originName={activeRoute?.origin_name || 'Main Campus Station'}
            destinationName={activeRoute?.destination_name || 'City Express Terminal'}
            userPosition={userPosition}
            focusedDriverId={focusedDriverId}
            followingDriverId={followingDriverId}
            onSelectDriver={(id) => setFocusedDriverId(id)}
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
                            onClick={() => setFocusedDriverId(d.driver_id)}
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
                            onClick={() =>
                              setFollowingDriverId(isFollowing ? null : d.driver_id)
                            }
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
                            onClick={() => setFocusedDriverId(b.id + 10000)}
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
                              {b.route_name || 'Route: Campus Express'} &middot; Reg: {b.license_plate}
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
