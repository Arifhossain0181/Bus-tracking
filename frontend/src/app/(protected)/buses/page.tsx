'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bus as BusIcon, Edit, Eye, Plus, Trash2, Unlink, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, ApiError } from '@/lib/api';
import type { Bus } from '@/lib/types';

export default function BusesPage() {
  const { user } = useAuth();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bus | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [busNumber, setBusNumber] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [busType, setBusType] = useState<'long' | 'shuttle'>('long');
  const [capacity, setCapacity] = useState(50);
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [isActive, setIsActive] = useState(true);

  const loadBuses = useCallback(async () => {
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const data = await apiFetch<Bus[]>(`/api/buses/${qs}`);
      setBuses(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadBuses();
  }, [loadBuses]);

  const openCreate = () => {
    setEditing(null);
    setBusNumber('');
    setLicensePlate('');
    setBusType('long');
    setCapacity(50);
    setModel('');
    setYear('');
    setIsActive(true);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (bus: Bus) => {
    setEditing(bus);
    setBusNumber(bus.bus_number);
    setLicensePlate(bus.license_plate);
    setBusType(bus.bus_type);
    setCapacity(bus.capacity);
    setModel(bus.model || '');
    setYear(bus.year ? String(bus.year) : '');
    setIsActive(bus.is_active);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      bus_number: busNumber.trim(),
      license_plate: licensePlate.trim(),
      bus_type: busType,
      capacity: Number(capacity),
      model: model.trim(),
      year: year ? Number(year) : null,
      is_active: isActive,
    };
    try {
      if (editing) {
        await apiFetch(`/api/buses/${editing.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/buses/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      loadBuses();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save bus.');
    }
  };

  const handleDelete = async (bus: Bus) => {
    if (!confirm(`Delete Bus ${bus.bus_number}?`)) return;
    await apiFetch(`/api/buses/${bus.id}/`, { method: 'DELETE' });
    loadBuses();
  };

  const handleClearAssignment = async (bus: Bus) => {
    if (!confirm(`Clear active assignment for Bus ${bus.bus_number}? Related schedules will be deactivated.`))
      return;
    await apiFetch(`/api/buses/${bus.id}/clear-assignment/`, { method: 'POST' });
    loadBuses();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buses</h1>
          <p className="text-sm text-slate-500">University bus fleet and current assignments</p>
        </div>
        {user?.role === 'admin' && (
          <div className="flex gap-2">
            <Link
              href="/buses/assignments"
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              Assignments
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Bus
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(['all', 'active', 'inactive'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${
              statusFilter === st
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading buses...</div>
      ) : buses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          No buses found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {buses.map((bus) => (
            <div
              key={bus.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <BusIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900">{bus.bus_number}</h2>
                      <p className="text-xs text-slate-500">{bus.license_plate}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      bus.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {bus.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1 pt-1">
                  <div>
                    Type: <strong>{bus.bus_type_display}</strong> &middot; Capacity:{' '}
                    <strong>{bus.capacity}</strong>
                  </div>
                  {(bus.model || bus.year) && (
                    <div>
                      Model: {bus.model || '--'} {bus.year ? `(${bus.year})` : ''}
                    </div>
                  )}
                  <div>
                    Route:{' '}
                    <strong className="text-blue-700">{bus.route_name || 'Unassigned'}</strong>
                  </div>
                  {bus.active_assignment && (
                    <div className="text-emerald-700 font-medium">
                      Driver: {bus.active_assignment.driver_name}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link
                  href={`/buses/${bus.id}`}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </Link>

                {user?.role === 'admin' && (
                  <div className="flex items-center gap-1.5">
                    {bus.active_assignment ? (
                      <button
                        type="button"
                        onClick={() => handleClearAssignment(bus)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200 inline-flex items-center gap-1"
                        title="Clear Assignment"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Clear
                      </button>
                    ) : (
                      <Link
                        href={`/buses/assignments?bus=${bus.id}`}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 inline-flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(bus)}
                      className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(bus)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
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

      {/* Add / Edit Bus Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold">{editing ? `Edit Bus ${editing.bus_number}` : 'Add New Bus'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3">
              {error && (
                <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bus Number *</label>
                <input
                  type="text"
                  required
                  value={busNumber}
                  onChange={(e) => setBusNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">License Plate *</label>
                <input
                  type="text"
                  required
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bus Type</label>
                  <select
                    value={busType}
                    onChange={(e) => setBusType(e.target.value as 'long' | 'shuttle')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="long">Long Route Bus</option>
                    <option value="shuttle">Shuttle Bus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Bus is active
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                >
                  Save Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
