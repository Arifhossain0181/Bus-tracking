'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, ApiError } from '@/lib/api';
import type { NotificationItem, RouteItem } from '@/lib/types';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'info' | 'warning' | 'danger' | 'success'>('info');
  const [target, setTarget] = useState('all');
  const [targetRoute, setTargetRoute] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await apiFetch<NotificationItem[]>('/api/notifications/');
      setNotifications(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    if (user?.role === 'admin') {
      apiFetch<RouteItem[]>('/api/schedules/routes/').then(setRoutes).catch(() => {});
    }
  }, [loadData, user?.role]);

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all/', { method: 'POST' });
    loadData();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/notifications/', {
        method: 'POST',
        body: JSON.stringify({
          title,
          message,
          priority,
          target,
          target_route: target === 'route' && targetRoute ? Number(targetRoute) : null,
        }),
      });
      setTitle('');
      setMessage('');
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send notification.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this notification?')) return;
    await apiFetch(`/api/notifications/${id}/`, { method: 'DELETE' });
    loadData();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">System announcements, delay alerts, and route updates</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4" />
            Mark All Read
          </button>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Send Notification
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No notifications yet.</div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="p-4 hover:bg-slate-50 flex items-start justify-between gap-3">
              <Link href={`/notifications/${n.id}`} className="flex items-start gap-3 flex-1 min-w-0">
                <Bell
                  className={`w-5 h-5 mt-0.5 shrink-0 ${
                    n.priority === 'danger'
                      ? 'text-red-500'
                      : n.priority === 'warning'
                      ? 'text-amber-500'
                      : n.priority === 'success'
                      ? 'text-emerald-500'
                      : 'text-blue-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900">{n.title}</div>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Target: {n.target} &middot; {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </Link>
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Send Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold">Send Notification</h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              {error && <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Message *</label>
                <textarea
                  rows={3}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'info' | 'warning' | 'danger' | 'success')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Urgent</option>
                    <option value="success">Success</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Audience</label>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="all">All Users</option>
                    <option value="users">Students/Faculty/Staff</option>
                    <option value="drivers">All Drivers</option>
                    <option value="route">Specific Route</option>
                    <option value="admin_authority">Admin & Authority</option>
                  </select>
                </div>
              </div>
              {target === 'route' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Route</label>
                  <select
                    required
                    value={targetRoute}
                    onChange={(e) => setTargetRoute(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Select Route</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                  Send Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
