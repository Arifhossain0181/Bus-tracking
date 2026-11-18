'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bus, Clock, MapPin, Search, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { RouteItem } from '@/lib/types';

interface GroupedResponse {
  shuttle: RouteItem[];
  metro: RouteItem[];
  long: RouteItem[];
  all: RouteItem[];
}

interface LiveEtaItem {
  stop_id: number;
  eta_time: string;
  delay_minutes: number;
  is_delayed: boolean;
}

export default function SchedulesPage() {
  const [grouped, setGrouped] = useState<GroupedResponse>({ shuttle: [], metro: [], long: [], all: [] });
  const [etas, setEtas] = useState<Record<number, LiveEtaItem>>({});
  const [tab, setTab] = useState<'shuttle' | 'metro' | 'long'>('shuttle');
  const [search, setSearch] = useState('');
  const [includeUnassigned, setIncludeUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalRoute, setModalRoute] = useState<RouteItem | null>(null);

  const loadData = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (includeUnassigned) qs.set('include_unassigned', 'true');
      const data = await apiFetch<GroupedResponse>(`/api/schedules/grouped/?${qs.toString()}`);
      setGrouped(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, includeUnassigned]);

  const loadEtas = useCallback(async () => {
    try {
      const list = await apiFetch<LiveEtaItem[]>('/api/buses/etas/');
      const map: Record<number, LiveEtaItem> = {};
      list.forEach((item) => {
        map[item.stop_id] = item;
      });
      setEtas(map);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadEtas();
    const interval = setInterval(loadEtas, 30000);
    return () => clearInterval(interval);
  }, [loadEtas]);

  const currentRoutes = grouped[tab];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bus Schedules</h1>
          <p className="text-sm text-slate-500">
            Browse active shuttle, metro, and long-road timetables with live tracking links
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeUnassigned}
              onChange={(e) => setIncludeUnassigned(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show all published routes
          </label>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              { key: 'shuttle', label: 'Shuttle Bus', count: grouped.shuttle.length },
              { key: 'metro', label: 'Metro Bus', count: grouped.metro.length },
              { key: 'long', label: 'Long Road', count: grouped.long.length },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}{' '}
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                  tab === t.key ? 'bg-blue-500 text-white' : 'bg-white text-slate-700'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search route or stop name..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Route Cards */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading schedules...</div>
      ) : currentRoutes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          No {tab} routes found{!includeUnassigned ? ' with active bus assignments' : ''}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {currentRoutes.map((route) => {
            const firstAssignment = route.active_assignments[0];
            return (
              <div
                key={route.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                style={{ borderTopWidth: 4, borderTopColor: route.color || '#2563eb' }}
              >
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-bold text-slate-900 text-lg leading-tight">{route.name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 shrink-0">
                      {route.route_type_display}
                    </span>
                  </div>

                  {route.route_type === 'long' ? (
                    <p className="text-sm text-slate-600">
                      Destination: <strong>{route.destination_name || 'Campus'}</strong> &middot;{' '}
                      {route.stops_count} pickup points
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      {route.origin_name || 'Campus'} &rarr; {route.destination_name || 'Destination'} &middot;{' '}
                      {route.trips_count} trips
                    </p>
                  )}

                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Service Days: {route.service_days_display || route.service_days}
                  </div>

                  {route.active_assignments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {route.active_assignments.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                        >
                          <Bus className="w-3 h-3" />
                          {a.bus_number} ({a.driver_name})
                          {a.driver_is_live && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setModalRoute(route)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                  >
                    {route.route_type === 'long' ? 'View Pickup Points' : 'View Timetable'}
                  </button>

                  <div className="flex items-center gap-2">
                    {firstAssignment && (
                      <Link
                        href={`/live-map?driver_id=${firstAssignment.driver_id}`}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 inline-flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Live Map
                      </Link>
                    )}
                    <Link
                      href={`/routes/${route.id}`}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timetable / Pickup Points Modal */}
      {modalRoute && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{modalRoute.name}</h3>
                <p className="text-xs text-blue-100">
                  {modalRoute.route_type_display} &middot; {modalRoute.service_days_display}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalRoute(null)}
                className="p-1.5 rounded-lg hover:bg-blue-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {modalRoute.route_type === 'long' ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2">#</th>
                      <th className="py-2">Pickup Point</th>
                      <th className="py-2">Scheduled</th>
                      <th className="py-2">Live ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalRoute.stops.map((s, idx) => {
                      const eta = etas[s.id];
                      return (
                        <tr key={s.id}>
                          <td className="py-2.5 font-semibold text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 font-medium text-slate-900">{s.name}</td>
                          <td className="py-2.5 text-slate-700">{s.scheduled_time || '--'}</td>
                          <td className="py-2.5">
                            {eta ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  eta.is_delayed
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {eta.eta_time}
                                {eta.delay_minutes > 0 ? ` (+${eta.delay_minutes}m)` : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2">Trip</th>
                      <th className="py-2">Departure ({modalRoute.origin_name || 'Origin'})</th>
                      <th className="py-2">Arrival ({modalRoute.destination_name || 'Dest'})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalRoute.trips.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2.5 font-semibold text-slate-900">
                          Trip {t.formatted_trip_number}
                        </td>
                        <td className="py-2.5 font-medium text-blue-700">{t.departure_time}</td>
                        <td className="py-2.5 text-slate-700">{t.arrival_time || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
