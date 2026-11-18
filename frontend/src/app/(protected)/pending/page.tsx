'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';

export default function PendingRegistrationsPage() {
  const { refreshUser } = useAuth();
  const [pending, setPending] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = useCallback(async () => {
    try {
      const data = await apiFetch<User[]>('/api/auth/pending/');
      setPending(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleApprove = async (u: User) => {
    await apiFetch(`/api/auth/pending/${u.id}/approve/`, { method: 'POST' });
    await Promise.all([loadPending(), refreshUser()]);
  };

  const handleReject = async (u: User) => {
    const reason = prompt(`Enter rejection reason for ${u.username} (optional):`) ?? '';
    await apiFetch(`/api/auth/pending/${u.id}/reject/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    await Promise.all([loadPending(), refreshUser()]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Registration Requests</h1>
        <p className="text-sm text-slate-500">Approve or reject new student, faculty, and staff registrations</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                <th className="px-4 py-3">Full Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">University ID</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading pending requests...
                  </td>
                </tr>
              ) : pending.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No pending registration requests right now.
                  </td>
                </tr>
              ) : (
                pending.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{u.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.username}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.university_id}</td>
                    <td className="px-4 py-3 capitalize">{u.role_display}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(u)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(u)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 inline-flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
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
