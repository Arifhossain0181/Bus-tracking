'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Journey, JourneyPath } from '@/lib/types';

const JourneyPathMapView = dynamic(() => import('@/components/maps/JourneyPathMapView'), {
  ssr: false,
  loading: () => <div className="h-[450px] rounded-xl bg-slate-200 animate-pulse" />,
});

export default function JourneyHistoryPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<JourneyPath | null>(null);

  const loadJourneys = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (dateFrom) qs.set('date_from', dateFrom);
      if (dateTo) qs.set('date_to', dateTo);
      const data = await apiFetch<Journey[]>(`/api/locations/journeys/?${qs.toString()}`);
      setJourneys(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadJourneys();
  }, [loadJourneys]);

  const openPathModal = async (journeyId: number) => {
    try {
      const pathData = await apiFetch<JourneyPath>(`/api/locations/journey/${journeyId}/path/`);
      setSelectedPath(pathData);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Journey History</h1>
        <p className="text-sm text-slate-500">Audit completed and active bus journeys with GPS path replay</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="aborted">Aborted</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setStatusFilter('');
            setDateFrom('');
            setDateTo('');
          }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
        >
          Reset Filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Bus</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">GPS Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading journeys...
                  </td>
                </tr>
              ) : journeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No journeys recorded for the selected criteria.
                  </td>
                </tr>
              ) : (
                journeys.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">#{j.id}</td>
                    <td className="px-4 py-3 font-medium">{j.driver_name}</td>
                    <td className="px-4 py-3 font-bold">{j.bus_number}</td>
                    <td className="px-4 py-3 text-blue-700">{j.route_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(j.start_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.duration_minutes != null ? `${j.duration_minutes} min` : 'Ongoing'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          j.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : j.status === 'completed'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openPathModal(j.id)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                        Path
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Path Modal */}
      {selectedPath && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold">
                  Journey #{selectedPath.journey_id} — Bus {selectedPath.bus_number}
                </h3>
                <p className="text-xs text-blue-100">
                  {selectedPath.driver} &middot; {selectedPath.route_name} &middot;{' '}
                  {selectedPath.path.length} GPS points
                </p>
              </div>
              <button type="button" onClick={() => setSelectedPath(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {selectedPath.path.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No GPS breadcrumbs were recorded during this journey.
                </div>
              ) : (
                <JourneyPathMapView path={selectedPath.path} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
