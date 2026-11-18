'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Plus } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import type { Issue } from '@/lib/types';

export default function IssuesListPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (typeFilter) qs.set('type', typeFilter);
      const data = await apiFetch<Issue[]>(`/api/issues/?${qs.toString()}`);
      setIssues(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Issues & Incident Reports</h1>
          <p className="text-sm text-slate-500">Track mechanical, traffic, weather, and emergency incidents</p>
        </div>
        {user?.role === 'driver' && (
          <Link
            href="/issues/new"
            className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg text-sm font-semibold hover:bg-amber-600 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Report Issue
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Types</option>
          <option value="mechanical">Mechanical Breakdown</option>
          <option value="traffic">Heavy Traffic Delay</option>
          <option value="emergency">Emergency</option>
          <option value="accident">Accident</option>
          <option value="weather">Weather Related</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading issues...</div>
        ) : issues.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No issues found.</div>
        ) : (
          issues.map((issue) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className="p-4 hover:bg-slate-50 flex flex-wrap items-center justify-between gap-3 block"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-sm text-slate-900">
                    #{issue.id} {issue.issue_type_display}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                    {issue.description || 'No description provided.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Reported by {issue.reported_by_name}
                    {issue.bus_number ? ` · Bus ${issue.bus_number}` : ''}
                    {issue.route_name ? ` · ${issue.route_name}` : ''} &middot;{' '}
                    {new Date(issue.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                  {issue.priority}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    issue.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : issue.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {issue.status_display}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
