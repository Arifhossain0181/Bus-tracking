'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Bus,
  Clock,
  MapPin,
  Play,
  Route,
  Send,
  Square,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, ApiError } from '@/lib/api';
import type { DriverLocationStatus } from '@/lib/types';

interface DashboardData {
  role: string;
  stats?: {
    total_buses: number;
    active_buses: number;
    total_routes: number;
    total_drivers: number;
    pending_issues?: number;
    pending_registrations?: number;
    total_users: number;
  };
  assignment?: {
    id: number;
    bus_id: number;
    bus_number: string;
    license_plate: string;
    route_id: number;
    route_name: string;
    route_type: string;
  } | null;
  recent_issues?: {
    id: number;
    issue_type_display: string;
    description: string;
    status: string;
    status_display: string;
    priority: string;
    created_at: string;
  }[];
  routes?: {
    id: number;
    name: string;
    route_type: string;
    origin_name: string;
    destination_name: string;
    stops_count: number;
    trips_count: number;
  }[];
  announcements?: {
    id: number;
    title: string;
    message: string;
    priority: string;
    created_at: string;
  }[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Driver journey state
  const [locStatus, setLocStatus] = useState<DriverLocationStatus | null>(null);
  const [journeyBusy, setJourneyBusy] = useState(false);
  const [driverMsg, setDriverMsg] = useState('');
  const [driverErr, setDriverErr] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(10);
  const [delayReason, setDelayReason] = useState('');
  const watchIdRef = useRef<number | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number; acc?: number; hdg?: number | null; spd?: number | null } | null>(null);

  // Authority feedback state
  const [authFeedback, setAuthFeedback] = useState('');
  const [authFeedbackMsg, setAuthFeedbackMsg] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiFetch<DashboardData>('/api/auth/dashboard/');
      setData(res);
      if (res.role === 'driver') {
        const st = await apiFetch<DriverLocationStatus>('/api/locations/location/status/');
        setLocStatus(st);
      }
    } catch {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Continuous GPS pushing while driver has active journey
  useEffect(() => {
    if (user?.role !== 'driver' || !locStatus?.has_active_journey) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          lastPosRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
            hdg: pos.coords.heading,
            spd: pos.coords.speed,
          };
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }

    const timer = setInterval(async () => {
      const p = lastPosRef.current;
      if (!p) return;
      try {
        await apiFetch('/api/locations/location/update/', {
          method: 'POST',
          body: JSON.stringify({
            latitude: Number(p.lat.toFixed(7)),
            longitude: Number(p.lng.toFixed(7)),
            accuracy: p.acc ?? null,
            heading: p.hdg ?? null,
            speed: p.spd ?? null,
          }),
        });
      } catch {
        // ignore transient errors
      }
    }, 5000);

    return () => {
      clearInterval(timer);
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [user?.role, locStatus?.has_active_journey]);

  const getCurrentCoords = (): Promise<{ latitude: number; longitude: number } | null> =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: Number(pos.coords.latitude.toFixed(7)),
            longitude: Number(pos.coords.longitude.toFixed(7)),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });

  const handleStartJourney = async () => {
    setDriverErr('');
    setDriverMsg('');
    setJourneyBusy(true);
    try {
      const coords = await getCurrentCoords();
      await apiFetch('/api/locations/journey/start/', {
        method: 'POST',
        body: JSON.stringify(coords || { latitude: 23.8103, longitude: 90.4125 }),
      });
      setDriverMsg('Journey started! Live GPS sharing is now active.');
      await loadDashboard();
    } catch (err) {
      setDriverErr(err instanceof ApiError ? err.message : 'Failed to start journey.');
    } finally {
      setJourneyBusy(false);
    }
  };

  const handleEndJourney = async () => {
    setDriverErr('');
    setDriverMsg('');
    setJourneyBusy(true);
    try {
      const coords = await getCurrentCoords();
      const res = await apiFetch<{ duration_minutes: number | null }>('/api/locations/journey/end/', {
        method: 'POST',
        body: JSON.stringify(coords || {}),
      });
      setDriverMsg(`Journey completed (${res.duration_minutes ?? 0} mins). GPS sharing stopped.`);
      await loadDashboard();
    } catch (err) {
      setDriverErr(err instanceof ApiError ? err.message : 'Failed to end journey.');
    } finally {
      setJourneyBusy(false);
    }
  };

  const handleReportDelay = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverErr('');
    setDriverMsg('');
    try {
      await apiFetch('/api/locations/journey/delay/', {
        method: 'POST',
        body: JSON.stringify({ delay_minutes: delayMinutes, reason: delayReason }),
      });
      setDriverMsg('Delay alert sent to passengers and administrators.');
      setDelayReason('');
    } catch (err) {
      setDriverErr(err instanceof ApiError ? err.message : 'Could not report delay.');
    }
  };

  const handleAuthorityFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFeedbackMsg('');
    if (!authFeedback.trim()) return;
    try {
      await apiFetch('/api/auth/authority-feedback/', {
        method: 'POST',
        body: JSON.stringify({ message: authFeedback }),
      });
      setAuthFeedback('');
      setAuthFeedbackMsg('Feedback sent to administration successfully!');
    } catch (err) {
      setAuthFeedbackMsg(err instanceof ApiError ? err.message : 'Failed to submit feedback.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // ADMIN DASHBOARD
  if (user?.role === 'admin' && data?.stats) {
    const s = data.stats;
    const cards = [
      { label: 'Total Buses', value: s.total_buses, sub: `${s.active_buses} active`, href: '/buses', color: 'bg-blue-600', icon: <Bus className="w-6 h-6" /> },
      { label: 'Total Routes', value: s.total_routes, sub: 'Manage routes', href: '/routes', color: 'bg-emerald-600', icon: <Route className="w-6 h-6" /> },
      { label: 'Drivers', value: s.total_drivers, sub: 'Fleet drivers', href: '/drivers', color: 'bg-indigo-600', icon: <Users className="w-6 h-6" /> },
      { label: 'Pending Issues', value: s.pending_issues ?? 0, sub: 'Needs attention', href: '/issues', color: 'bg-amber-500', icon: <AlertTriangle className="w-6 h-6" /> },
      { label: 'Pending Approvals', value: s.pending_registrations ?? 0, sub: 'Registration requests', href: '/pending', color: 'bg-rose-600', icon: <UserCheck className="w-6 h-6" /> },
      { label: 'Registered Users', value: s.total_users, sub: 'Students, Faculty & Staff', href: '/users', color: 'bg-slate-700', icon: <Users className="w-6 h-6" /> },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-500">Welcome back, {user.full_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/routes/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              + New Route
            </Link>
            <Link href="/buses/assignments" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              Manage Assignments
            </Link>
            <Link href="/live-map" className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900">
              Open Live Map
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-500">{c.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{c.value}</p>
                <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl ${c.color} text-white flex items-center justify-center`}>
                {c.icon}
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // DRIVER DASHBOARD
  if (user?.role === 'driver') {
    const activeJourney = locStatus?.has_active_journey;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Driver Dashboard</h1>
            <p className="text-sm text-slate-500">Welcome, {user.full_name}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/share-location" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              GPS Console
            </Link>
            <Link href="/issues/new" className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg text-sm font-semibold hover:bg-amber-600">
              Report Issue
            </Link>
          </div>
        </div>

        {driverMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            {driverMsg}
          </div>
        )}
        {driverErr && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {driverErr}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assignment & Journey Control */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Bus className="w-5 h-5 text-blue-600" />
              Active Assignment & Journey
            </h2>

            {data?.assignment ? (
              <>
                <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                  <div>
                    <span className="text-slate-500 block text-xs">Assigned Bus</span>
                    <span className="font-bold text-slate-900">{data.assignment.bus_number}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs">License Plate</span>
                    <span className="font-semibold text-slate-800">{data.assignment.license_plate}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-xs">Assigned Route</span>
                    <span className="font-bold text-blue-700">{data.assignment.route_name}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100">
                  <span className="text-sm font-medium text-slate-700">Journey Status</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      activeJourney ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {activeJourney ? 'LIVE & SHARING GPS' : 'NOT STARTED'}
                  </span>
                </div>

                {!activeJourney ? (
                  <button
                    type="button"
                    disabled={journeyBusy}
                    onClick={handleStartJourney}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    {journeyBusy ? 'Starting...' : 'START JOURNEY'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={journeyBusy}
                    onClick={handleEndJourney}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    <Square className="w-5 h-5" />
                    {journeyBusy ? 'Ending...' : 'END JOURNEY'}
                  </button>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                You do not have an active bus assignment right now. Contact an administrator.
              </div>
            )}
          </div>

          {/* Report Delay */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Report Delay
            </h2>
            <form onSubmit={handleReportDelay} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Delay (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <textarea
                  rows={3}
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  placeholder="e.g., Heavy traffic near Uttara..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={!activeJourney}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-semibold rounded-lg text-sm"
              >
                {activeJourney ? 'Broadcast Delay Alert' : 'Start a journey first to report delay'}
              </button>
            </form>
          </div>
        </div>

        {/* Recent Issues */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Recent Reported Issues</h2>
            <Link href="/issues" className="text-sm text-blue-600 font-medium hover:underline">
              View All
            </Link>
          </div>
          {!data?.recent_issues?.length ? (
            <p className="text-sm text-slate-500">No issues reported recently.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recent_issues.map((i) => (
                <Link
                  key={i.id}
                  href={`/issues/${i.id}`}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg"
                >
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{i.issue_type_display}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{i.description || 'No description'}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                    {i.status_display}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // AUTHORITY DASHBOARD
  if (user?.role === 'authority' && data?.stats) {
    const s = data.stats;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Authority Dashboard</h1>
            <p className="text-sm text-slate-500">University Transport Oversight & Analytics</p>
          </div>
          <Link href="/reports" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Open Full Reports
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs text-slate-500">Total Buses</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{s.total_buses}</p>
            <p className="text-xs text-emerald-600 mt-1">{s.active_buses} active</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs text-slate-500">Active Routes</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{s.total_routes}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs text-slate-500">Registered Passengers</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{s.total_users}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs text-slate-500">Fleet Drivers</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{s.total_drivers}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            Send Directive / Feedback to Admin
          </h2>
          {authFeedbackMsg && (
            <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
              {authFeedbackMsg}
            </div>
          )}
          <form onSubmit={handleAuthorityFeedback} className="space-y-3">
            <textarea
              rows={4}
              required
              value={authFeedback}
              onChange={(e) => setAuthFeedback(e.target.value)}
              placeholder="Write instructions, observations, or feedback for transport administration..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              Submit Feedback
            </button>
          </form>
        </div>
      </div>
    );
  }

  // REGULAR USER DASHBOARD
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.full_name}</h1>
          <p className="text-sm text-slate-500">Track university buses and browse schedules</p>
        </div>
        <div className="flex gap-2">
          <Link href="/live-map" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Live Map
          </Link>
          <Link href="/schedules" className="px-4 py-2 bg-white border border-slate-300 text-slate-800 rounded-lg text-sm font-medium">
            View Schedules
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-3">Active Routes</h2>
          <div className="space-y-2">
            {(data?.routes || []).map((r) => (
              <Link
                key={r.id}
                href={`/routes/${r.id}`}
                className="block p-3 rounded-lg border border-slate-200 hover:border-blue-400 transition-colors"
              >
                <div className="font-semibold text-sm text-slate-900">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {r.origin_name && r.destination_name ? `${r.origin_name} → ${r.destination_name}` : `${r.stops_count} stops`}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-3">Latest Announcements</h2>
          <div className="space-y-2">
            {(data?.announcements || []).map((a) => (
              <Link
                key={a.id}
                href={`/notifications/${a.id}`}
                className="block p-3 rounded-lg bg-slate-50 hover:bg-slate-100"
              >
                <div className="font-semibold text-sm text-slate-900">{a.title}</div>
                <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{a.message}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
