'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Unlink } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { BusAssignment } from '@/lib/types';

interface AssignmentOptions {
  buses: { id: number; bus_number: string; license_plate: string }[];
  drivers: { id: number; username: string; full_name: string }[];
  routes: { id: number; name: string; route_type: string }[];
}

function AssignmentsContent() {
  const searchParams = useSearchParams();
  const preselectedBus = searchParams.get('bus') || '';

  const [assignments, setAssignments] = useState<BusAssignment[]>([]);
  const [options, setOptions] = useState<AssignmentOptions>({ buses: [], drivers: [], routes: [] });
  const [busId, setBusId] = useState(preselectedBus);
  const [driverId, setDriverId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [list, opts] = await Promise.all([
        apiFetch<BusAssignment[]>('/api/buses/assignments/'),
        apiFetch<AssignmentOptions>('/api/buses/assignments/options/'),
      ]);
      setAssignments(list);
      setOptions(opts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await apiFetch('/api/buses/assignments/', {
        method: 'POST',
        body: JSON.stringify({
          bus: Number(busId),
          driver: Number(driverId),
          route: Number(routeId),
        }),
      });
      setSuccess('Bus assigned successfully and route schedules updated.');
      setBusId('');
      setDriverId('');
      setRouteId('');
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create assignment.');
    }
  };

  const handleClear = async (bId: number, busNum: string) => {
    if (!confirm(`Clear active assignment for Bus ${busNum}?`)) return;
    await apiFetch(`/api/buses/${bId}/clear-assignment/`, { method: 'POST' });
    loadData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bus Assignments</h1>
        <p className="text-sm text-slate-500">
          Assign unassigned drivers and buses to routes (auto-generates route schedules)
        </p>
      </div>

      {/* Create Assignment Form */}
      <form
        onSubmit={handleAssign}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4"
      >
        <h2 className="font-bold text-slate-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-600" />
          New Assignment
        </h2>

        {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
        {success && <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">{success}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Available Bus *</label>
            <select
              required
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select Bus</option>
              {options.buses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bus_number} ({b.license_plate})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Available Driver *</label>
            <select
              required
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select Driver</option>
              {options.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Available Route *</label>
            <select
              required
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select Route</option>
              {options.routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          Assign Bus & Update Schedules
        </button>
      </form>

      {/* Assignments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Bus</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading assignments...
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No assignments found.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{a.date || '--'}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{a.bus_number}</td>
                    <td className="px-4 py-3">{a.driver_name}</td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{a.route_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {a.is_active ? 'Active' : 'Completed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.is_active && (
                        <button
                          type="button"
                          onClick={() => handleClear(a.bus, a.bus_number)}
                          className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200 inline-flex items-center gap-1"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading...</div>}>
      <AssignmentsContent />
    </Suspense>
  );
}
