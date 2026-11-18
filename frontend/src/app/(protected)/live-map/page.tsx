'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Bus, Crosshair, Navigation, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { ActiveDriverLocation } from '@/lib/types';

const LiveMapView = dynamic(() => import('@/components/maps/LiveMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] w-full rounded-xl bg-slate-200 animate-pulse flex items-center justify-center text-slate-500 text-sm">
      Loading interactive map...
    </div>
  ),
});

function LiveMapContent() {
  const searchParams = useSearchParams();
  const initialDriverId = searchParams.get('driver_id') ? Number(searchParams.get('driver_id')) : null;

  const [drivers, setDrivers] = useState<ActiveDriverLocation[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('Never');
  const [focusedDriverId, setFocusedDriverId] = useState<number | null>(initialDriverId);
  const [followingDriverId, setFollowingDriverId] = useState<number | null>(initialDriverId);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActive = useCallback(async () => {
    try {
      const data = await apiFetch<ActiveDriverLocation[]>('/api/locations/location/active/');
      setDrivers(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActive();
    const timer = setInterval(fetchActive, 10000);
    return () => clearInterval(timer);
  }, [fetchActive]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Bus Map</h1>
          <p className="text-sm text-slate-500">
            {drivers.length} active bus{drivers.length === 1 ? '' : 'es'} on the road &middot; Last updated: {lastUpdated}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={fetchActive}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <LiveMapView
            drivers={drivers}
            userPosition={userPosition}
            focusedDriverId={focusedDriverId}
            followingDriverId={followingDriverId}
            onSelectDriver={(id) => setFocusedDriverId(id)}
          />
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-sm flex items-center justify-between">
              <span>Active Buses</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-bold">
                {drivers.length}
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {loading ? (
                <div className="p-4 text-sm text-slate-500 text-center">Loading active buses...</div>
              ) : drivers.length === 0 ? (
                <div className="p-5 text-center text-sm text-slate-500">
                  No buses are currently sharing live GPS.
                </div>
              ) : (
                drivers.map((d) => {
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
                            <Bus className="w-4 h-4 text-amber-500" />
                            {d.bus_number || 'Bus'}
                          </span>
                          <span className="text-xs text-slate-500">{speedKmh} km/h</span>
                        </div>
                        <p className="text-xs text-blue-700 font-medium mt-0.5">
                          {d.route_name || 'No route'}
                        </p>
                        <p className="text-xs text-slate-500">{d.driver_name}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFollowingDriverId(isFollowing ? null : d.driver_id)
                        }
                        className={`w-full py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 ${
                          isFollowing
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        {isFollowing ? 'Following (Stop)' : 'Follow Bus'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-xs space-y-2">
            <h3 className="font-bold text-slate-800 text-sm">Map Legend</h3>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 inline-block" />
              <span>Active Bus (Live GPS)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-red-600 inline-block" />
              <span>Followed Bus</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-600 inline-block" />
              <span>Your Location</span>
            </div>
          </div>
        </div>
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
