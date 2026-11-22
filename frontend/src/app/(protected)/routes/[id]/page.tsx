'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bus, Edit, Globe, Lock, Map, MapPin, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import type { RouteItem } from '@/lib/types';

const RouteMapView = dynamic(() => import('@/components/maps/RouteMapView'), {
  ssr: false,
  loading: () => <div className="h-80 rounded-xl bg-slate-200 animate-pulse" />,
});

interface StopEtaInfo {
  id: number;
  eta: string | null;
  eta_minutes: number | null;
  is_delayed: boolean;
  delay_minutes: number;
}

export default function RouteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id as string;

  const [route, setRoute] = useState<RouteItem | null>(null);
  const [stopEtas, setStopEtas] = useState<Record<number, StopEtaInfo>>({});
  const [loading, setLoading] = useState(true);

  // Add Stop modal/inline form
  const [showAddStop, setShowAddStop] = useState(false);
  const [stopName, setStopName] = useState('');
  const [stopTime, setStopTime] = useState('');
  const [stopLat, setStopLat] = useState('');
  const [stopLng, setStopLng] = useState('');
  const [stopMajor, setStopMajor] = useState(false);

  const loadRoute = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<RouteItem>(`/api/schedules/routes/${id}/`);
      setRoute(data);
    } catch {
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadEtas = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<{ stops: StopEtaInfo[] }>(`/api/schedules/routes/${id}/eta/`);
      const map: Record<number, StopEtaInfo> = {};
      (data.stops || []).forEach((s) => {
        map[s.id] = s;
      });
      setStopEtas(map);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    loadRoute();
    loadEtas();
    const timer = setInterval(loadEtas, 10000);
    return () => clearInterval(timer);
  }, [loadRoute, loadEtas]);

  const togglePublish = async () => {
    if (!route) return;
    const ep = route.is_published
      ? `/api/schedules/routes/${route.id}/unpublish/`
      : `/api/schedules/routes/${route.id}/publish/`;
    const updated = await apiFetch<RouteItem>(ep, { method: 'POST' });
    setRoute(updated);
  };

  const handleDelete = async () => {
    if (!route || !confirm(`Delete route "${route.name}"?`)) return;
    await apiFetch(`/api/schedules/routes/${route.id}/`, { method: 'DELETE' });
    router.push('/routes');
  };

  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!route || !stopName.trim()) return;
    await apiFetch(`/api/schedules/routes/${route.id}/stops/`, {
      method: 'POST',
      body: JSON.stringify({
        name: stopName.trim(),
        latitude: stopLat ? Number(stopLat) : 23.8103,
        longitude: stopLng ? Number(stopLng) : 90.4125,
        scheduled_time: stopTime || null,
        is_major_stop: stopMajor,
      }),
    });
    setStopName('');
    setStopTime('');
    setStopLat('');
    setStopLng('');
    setShowAddStop(false);
    loadRoute();
  };

  const handleDeleteStop = async (stopId: number) => {
    if (!confirm('Remove this stop?')) return;
    await apiFetch(`/api/schedules/stops/${stopId}/`, { method: 'DELETE' });
    loadRoute();
  };

  if (loading) return <div className="py-12 text-center text-sm text-slate-500">Loading route...</div>;
  if (!route) return <div className="py-12 text-center text-sm text-red-600">Route not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/routes" className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{route.name}</h1>
            <p className="text-sm text-slate-500">
              {route.route_type_display} &middot; {route.service_days_display}
            </p>
          </div>
        </div>

        {user?.role === 'admin' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={togglePublish}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                route.is_published
                  ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {route.is_published ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              {route.is_published ? 'Unpublish' : 'Publish'}
            </button>
            <Link
              href={`/routes/${route.id}/builder`}
              className="px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 inline-flex items-center gap-1.5"
            >
              <Map className="w-3.5 h-3.5" />
              Route Builder
            </Link>
            <Link
              href={`/routes/${route.id}/edit`}
              className="px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit Route
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="px-3.5 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left info */}
        <div className="space-y-4">
          <div
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3"
            style={{ borderTopWidth: 4, borderTopColor: route.color || '#2563eb' }}
          >
            <h2 className="font-bold text-slate-900">Route Info</h2>
            <div className="text-sm space-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-500">Status: </span>
                <span className={route.is_published ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                  {route.is_published ? 'Published & Active' : 'Draft / Inactive'}
                </span>
              </div>
              {route.origin_name && (
                <div>
                  <span className="text-slate-500">Origin: </span>
                  <strong>{route.origin_name}</strong>
                </div>
              )}
              {route.destination_name && (
                <div>
                  <span className="text-slate-500">Destination: </span>
                  <strong>{route.destination_name}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-500">Stops: </span>
                <strong>{route.stops_count}</strong>
              </div>
              <div>
                <span className="text-slate-500">Trips: </span>
                <strong>{route.trips_count}</strong>
              </div>
              {route.estimated_duration_mins && (
                <div>
                  <span className="text-slate-500">Est. Duration: </span>
                  <strong>{route.estimated_duration_mins} mins</strong>
                </div>
              )}
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Geometry Revision:</span>
                  {route.active_revision ? (
                    <span className="font-semibold text-emerald-700">
                      Rev #{route.active_revision.revision_number} (Active)
                    </span>
                  ) : (
                    <span className="text-slate-400">None (Schematic)</span>
                  )}
                </div>
                {route.active_revision?.distance_km && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Path Distance:</span>
                    <span className="font-semibold text-slate-700">
                      {route.active_revision.distance_km} km
                    </span>
                  </div>
                )}
                {user?.role === 'admin' && (
                  <Link
                    href={`/routes/${route.id}/builder`}
                    className="inline-block mt-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    Open Visual Route Builder &rarr;
                  </Link>
                )}
              </div>
              {route.description && <p className="text-xs text-slate-500 pt-2">{route.description}</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-slate-900">Assigned Buses</h2>
            {route.active_assignments.length === 0 ? (
              <p className="text-sm text-slate-500">No buses currently assigned.</p>
            ) : (
              <div className="space-y-2">
                {route.active_assignments.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                        <Bus className="w-4 h-4 text-blue-600" />
                        {a.bus_number}
                      </div>
                      <div className="text-xs text-slate-500">{a.driver_name}</div>
                    </div>
                    <Link
                      href={`/buses/${a.bus_id}/follow`}
                      className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                    >
                      Follow
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right map + stops */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Route Map</h2>
              {showAddStop && (
                <span className="text-xs text-emerald-700 font-medium">
                  Click anywhere on the map to pick stop coordinates
                </span>
              )}
            </div>
            <RouteMapView
              stops={route.stops}
              color={route.color || '#2563eb'}
              activeGeometry={route.active_geometry || route.active_revision?.geometry}
              onMapClick={
                showAddStop
                  ? (lat, lng) => {
                      setStopLat(String(lat));
                      setStopLng(String(lng));
                    }
                  : undefined
              }
              pickedCoords={showAddStop && stopLat && stopLng ? [Number(stopLat), Number(stopLng)] : null}
            />
          </div>

          {/* Stops Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Stops & Live ETA</h2>
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setShowAddStop((v) => !v)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showAddStop ? 'Cancel' : 'Add Stop'}
                </button>
              )}
            </div>

            {showAddStop && (
              <form onSubmit={handleAddStop} className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Stop Name"
                  value={stopName}
                  onChange={(e) => setStopName(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
                <input
                  type="time"
                  value={stopTime}
                  onChange={(e) => setStopTime(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
                <div className="sm:col-span-2 flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                    {stopLat && stopLng ? (
                      <span className="text-emerald-800 font-medium">
                        Picked on Map: {Number(stopLat).toFixed(5)}, {Number(stopLng).toFixed(5)}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Click on the route map above to pick location pin (Optional)
                      </span>
                    )}
                  </div>
                  {stopLat && stopLng && (
                    <button
                      type="button"
                      onClick={() => {
                        setStopLat('');
                        setStopLng('');
                      }}
                      className="text-xs text-red-600 hover:text-red-700 underline font-medium"
                    >
                      Clear Pin
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={stopMajor}
                    onChange={(e) => setStopMajor(e.target.checked)}
                  />
                  Major Stop
                </label>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
                  >
                    Save Stop
                  </button>
                </div>
              </form>
            )}

            {route.stops.length === 0 ? (
              <p className="text-sm text-slate-500">No stops defined for this route yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2">#</th>
                      <th className="py-2">Stop Name</th>
                      <th className="py-2">Scheduled</th>
                      <th className="py-2">Live ETA</th>
                      {user?.role === 'admin' && <th className="py-2 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {route.stops.map((s, idx) => {
                      const eta = stopEtas[s.id];
                      return (
                        <tr key={s.id}>
                          <td className="py-2.5 text-slate-500 font-semibold">{idx + 1}</td>
                          <td className="py-2.5 font-medium text-slate-900">
                            {s.name}
                            {s.is_major_stop && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800 font-semibold">
                                Major
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-600">{s.scheduled_time || '--'}</td>
                          <td className="py-2.5">
                            {eta?.eta ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  eta.is_delayed
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {eta.eta}
                                {eta.delay_minutes > 0 ? ` (+${eta.delay_minutes}m)` : ' On Time'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Pending</span>
                            )}
                          </td>
                          {user?.role === 'admin' && (
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteStop(s.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trips Table */}
          {route.trips.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-bold text-slate-900 mb-3">Trip Timetable</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2">Trip</th>
                      <th className="py-2">Departure</th>
                      <th className="py-2">Arrival</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {route.trips.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 font-semibold text-slate-900">
                          Trip {t.formatted_trip_number}
                        </td>
                        <td className="py-2 text-blue-700 font-medium">{t.departure_time}</td>
                        <td className="py-2 text-slate-600">{t.arrival_time || '--'}</td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-semibold">
                            {t.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
