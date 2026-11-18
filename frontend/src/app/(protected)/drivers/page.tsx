'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Edit, Plus, Trash2, User as UserIcon, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

export default function DriversPage() {
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [nidNumber, setNidNumber] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const loadDrivers = useCallback(async () => {
    try {
      const data = await apiFetch<User[]>('/api/auth/drivers/');
      setDrivers(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  const openCreate = () => {
    setEditing(null);
    setFullName('');
    setUsername('');
    setPassword('');
    setPhone('');
    setAddress('');
    setNidNumber('');
    setPhoto(null);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (d: User) => {
    setEditing(d);
    setFullName(d.full_name);
    setUsername(d.username);
    setPassword('');
    setPhone(d.phone || '');
    setAddress(d.address || '');
    setNidNumber(d.nid_number || '');
    setPhoto(null);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    fd.append('full_name', fullName);
    if (!editing) fd.append('username', username);
    if (password) fd.append('password', password);
    fd.append('phone', phone);
    fd.append('address', address);
    fd.append('nid_number', nidNumber);
    if (photo) fd.append('photo', photo);

    try {
      if (editing) {
        await apiFetch(`/api/auth/drivers/${editing.id}/`, {
          method: 'PATCH',
          body: fd,
        });
      } else {
        await apiFetch('/api/auth/drivers/', {
          method: 'POST',
          body: fd,
        });
      }
      setModalOpen(false);
      loadDrivers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save driver.');
    }
  };

  const handleDelete = async (d: User) => {
    if (!confirm(`Delete driver "${d.full_name}"?`)) return;
    await apiFetch(`/api/auth/drivers/${d.id}/`, { method: 'DELETE' });
    loadDrivers();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Drivers</h1>
          <p className="text-sm text-slate-500">Manage university bus drivers and contact information</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Driver
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading drivers...</div>
      ) : drivers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          No drivers found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {drivers.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3">
                {d.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.profile_picture_url}
                    alt={d.full_name}
                    className="w-12 h-12 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <UserIcon className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 truncate">{d.full_name}</h2>
                  <p className="text-xs text-slate-500">@{d.username}</p>
                  <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                    <div>Phone: {d.phone || '--'}</div>
                    <div>NID: {d.nid_number || '--'}</div>
                    {d.address && <div className="line-clamp-1">Address: {d.address}</div>}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => openEdit(d)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 inline-flex items-center gap-1"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(d)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold">{editing ? `Edit ${editing.full_name}` : 'Add New Driver'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3">
              {error && <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              {!editing && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password {editing ? '(optional)' : '*'}
                </label>
                <input
                  type="password"
                  required={!editing}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NID Number</label>
                  <input
                    type="text"
                    value={nidNumber}
                    onChange={(e) => setNidNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600"
                />
              </div>
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
                  Save Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
