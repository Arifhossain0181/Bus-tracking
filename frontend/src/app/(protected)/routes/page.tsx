'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bus, Edit, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import type { RouteItem } from '@/lib/types';

export default function RoutesListPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);

  const loadRoutes = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const data = await apiFetch<RouteItem[]>(`/api/schedules/routes/?${qs.toString()}`);
      setRoutes(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const handleDelete = async (route: RouteItem) => {
    if (!confirm(`Delete route "${route.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/schedules/routes/${route.id}/`, { method: 'DELETE' });
      loadRoutes();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Routes</h1>
          <p className="text-sm text-slate-500">University shuttle, metro, and long-road routes</p>
        </div>
        {user?.role === 'admin' && (
          <Link
            href="/routes/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Route
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search routes or stops..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading routes...</div>
      ) : routes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          No routes found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {routes.map((route) => (
            <div
              key={route.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
              style={{ borderLeftWidth: 4, borderLeftColor: route.color || '#2563eb' }}
            >
              <div className="p-5 flex-1 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold text-slate-900">{route.name}</h2>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                      {route.route_type_display}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        route.is_published
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {route.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                </div>

                {route.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{route.description}</p>
                )}

                <div className="text-xs text-slate-600 space-y-1">
                  {route.route_type === 'long' ? (
                    <div>
                      Destination: <strong>{route.destination_name || 'Campus'}</strong> ({route.stops_count}{' '}
                      pickup points)
                    </div>
                  ) : (
                    <div>
                      {route.origin_name || 'Campus'} &rarr; {route.destination_name || 'Destination'} (
                      {route.trips_count} trips)
                    </div>
                  )}
                  {route.estimated_duration_mins && (
                    <div>Est. Duration: {route.estimated_duration_mins} mins</div>
                  )}
                </div>

                {route.active_assignments.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {route.active_assignments.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-medium"
                      >
                        <Bus className="w-3 h-3" />
                        {a.bus_number}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link
                  href={`/routes/${route.id}`}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </Link>
                {user?.role === 'admin' && (
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/routes/${route.id}/edit`}
                      className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(route)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
