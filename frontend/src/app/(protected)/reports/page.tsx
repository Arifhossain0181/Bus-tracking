'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Star } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type TabKey = 'overview' | 'popularity' | 'performance' | 'incidents' | 'drivers' | 'feedback';

interface OverviewData {
  stats: {
    total_routes: number;
    total_buses: number;
    total_drivers: number;
    active_issues: number;
    total_trips_30d: number;
  };
  route_performance: {
    route_name: string;
    total_trips: number;
    on_time_trips: number;
    on_time_pct: number;
  }[];
}

interface AnalyticsData {
  routes: {
    route__name: string;
    total_trips: number;
    on_time_trips: number;
    total_passengers: number;
    avg_delay: number | null;
  }[];
}

interface PerformanceData {
  overall: { total: number | null; on_time: number | null; delayed: number | null };
  by_route: {
    route__name: string;
    total: number;
    on_time: number;
    delayed: number;
    avg_delay: number | null;
  }[];
}

interface IncidentsData {
  incidents: {
    id: number;
    issue_type_display: string;
    reported_by_name: string;
    bus_number: string | null;
    route_name: string | null;
    status_display: string;
    created_at: string;
  }[];
  incident_summary: { issue_type: string; count: number }[];
}

interface DriverLogsData {
  drivers: {
    id: number;
    full_name: string;
    username: string;
    phone: string;
    total_assignments: number;
    total_issues: number;
  }[];
}

interface FeedbackSummaryData {
  overall: { total: number; avg: number | null };
  feedbacks: {
    id: number;
    user_name: string;
    category_display: string;
    rating: number;
    comment: string;
    created_at: string;
  }[];
  authority_feedbacks: {
    id: number;
    user_name: string;
    message: string;
    created_at: string;
  }[];
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [incidents, setIncidents] = useState<IncidentsData | null>(null);
  const [driverLogs, setDriverLogs] = useState<DriverLogsData | null>(null);
  const [feedbackData, setFeedbackData] = useState<FeedbackSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTab = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (startDate) qs.set('start_date', startDate);
    if (endDate) qs.set('end_date', endDate);
    const q = qs.toString() ? `?${qs.toString()}` : '';

    try {
      if (tab === 'overview') {
        setOverview(await apiFetch<OverviewData>('/api/reports/overview/'));
      } else if (tab === 'popularity') {
        setAnalytics(await apiFetch<AnalyticsData>(`/api/reports/analytics/${q}`));
      } else if (tab === 'performance') {
        setPerformance(await apiFetch<PerformanceData>(`/api/reports/performance/${q}`));
      } else if (tab === 'incidents') {
        setIncidents(await apiFetch<IncidentsData>(`/api/reports/driver-incidents/${q}`));
      } else if (tab === 'drivers') {
        setDriverLogs(await apiFetch<DriverLogsData>(`/api/reports/driver-logs/${q}`));
      } else if (tab === 'feedback') {
        setFeedbackData(await apiFetch<FeedbackSummaryData>('/api/reports/feedback-summary/'));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tab, startDate, endDate]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const handleExport = async (type: 'performance' | 'trips' | 'feedback') => {
    const data = await apiFetch(`/api/reports/export/?type=${type}&days=30`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ubus-${type}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics & Reports</h1>
          <p className="text-sm text-slate-500">Operational metrics, punctuality, incidents, and feedback</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['performance', 'trips', 'feedback'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleExport(t)}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 inline-flex items-center gap-1 capitalize"
            >
              <Download className="w-3.5 h-3.5" />
              Export {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs + Date filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'overview', label: 'Overview' },
              { key: 'popularity', label: 'Route Popularity' },
              { key: 'performance', label: 'On-Time Performance' },
              { key: 'incidents', label: 'Driver Incidents' },
              { key: 'drivers', label: 'Driver Logs' },
              { key: 'feedback', label: 'User Feedback' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                tab === item.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          Loading report data...
        </div>
      ) : (
        <>
          {tab === 'overview' && overview && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Active Routes', val: overview.stats.total_routes },
                  { label: 'Active Buses', val: overview.stats.total_buses },
                  { label: 'Drivers', val: overview.stats.total_drivers },
                  { label: 'Pending Issues', val: overview.stats.active_issues },
                  { label: 'Trips (30d)', val: overview.stats.total_trips_30d },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">{s.label}</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{s.val}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h2 className="font-bold text-slate-900 mb-3">Route On-Time Summary (Last 30 Days)</h2>
                {overview.route_performance.length === 0 ? (
                  <p className="text-sm text-slate-500">No route analytics recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {overview.route_performance.map((r) => (
                      <div key={r.route_name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-800">{r.route_name}</span>
                          <span className="text-slate-600">
                            {r.on_time_trips}/{r.total_trips} on time ({r.on_time_pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, r.on_time_pct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'popularity' && analytics && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Total Trips</th>
                    <th className="px-4 py-3">Total Passengers</th>
                    <th className="px-4 py-3">Avg Delay (min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.routes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No analytics data for this period.
                      </td>
                    </tr>
                  ) : (
                    analytics.routes.map((r) => (
                      <tr key={r.route__name}>
                        <td className="px-4 py-3 font-medium">{r.route__name}</td>
                        <td className="px-4 py-3">{r.total_trips}</td>
                        <td className="px-4 py-3 font-bold text-blue-700">{r.total_passengers}</td>
                        <td className="px-4 py-3">{r.avg_delay != null ? Number(r.avg_delay).toFixed(1) : '0.0'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'performance' && performance && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Total Trips</th>
                    <th className="px-4 py-3">On Time</th>
                    <th className="px-4 py-3">Delayed</th>
                    <th className="px-4 py-3">Avg Delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {performance.by_route.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No performance data available.
                      </td>
                    </tr>
                  ) : (
                    performance.by_route.map((r) => (
                      <tr key={r.route__name}>
                        <td className="px-4 py-3 font-medium">{r.route__name}</td>
                        <td className="px-4 py-3">{r.total}</td>
                        <td className="px-4 py-3 text-emerald-700 font-semibold">{r.on_time}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{r.delayed}</td>
                        <td className="px-4 py-3">{r.avg_delay != null ? Number(r.avg_delay).toFixed(1) : '0.0'}m</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'incidents' && incidents && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Bus / Route</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {incidents.incidents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No incidents in this period.
                      </td>
                    </tr>
                  ) : (
                    incidents.incidents.map((i) => (
                      <tr key={i.id}>
                        <td className="px-4 py-3 font-medium">{i.issue_type_display}</td>
                        <td className="px-4 py-3">{i.reported_by_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {i.bus_number || '--'} / {i.route_name || '--'}
                        </td>
                        <td className="px-4 py-3">{i.status_display}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(i.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'drivers' && driverLogs && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Assignments</th>
                    <th className="px-4 py-3">Reported Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {driverLogs.drivers.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-3 font-medium">
                        {d.full_name} <span className="text-xs text-slate-400">(@{d.username})</span>
                      </td>
                      <td className="px-4 py-3">{d.phone || '--'}</td>
                      <td className="px-4 py-3 font-semibold">{d.total_assignments}</td>
                      <td className="px-4 py-3">{d.total_issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'feedback' && feedbackData && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-6">
                <div>
                  <div className="text-xs text-slate-500">Total Feedback</div>
                  <div className="text-2xl font-bold text-slate-900">{feedbackData.overall.total}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Average Rating</div>
                  <div className="text-2xl font-bold text-amber-500 flex items-center gap-1">
                    {feedbackData.overall.avg ? Number(feedbackData.overall.avg).toFixed(1) : '0.0'}
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                {feedbackData.feedbacks.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No user feedback yet.</div>
                ) : (
                  feedbackData.feedbacks.map((f) => (
                    <div key={f.id} className="p-4 space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-slate-900">
                          {f.user_name}{' '}
                          <span className="font-normal text-xs text-slate-500">({f.category_display})</span>
                        </span>
                        <span className="text-amber-500 font-bold">{f.rating}/5 ★</span>
                      </div>
                      <p className="text-sm text-slate-700">{f.comment || 'No comment'}</p>
                      <p className="text-[11px] text-slate-400">{new Date(f.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>

              {feedbackData.authority_feedbacks.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <h2 className="font-bold text-slate-900">Authority Directives</h2>
                  {feedbackData.authority_feedbacks.map((af) => (
                    <div key={af.id} className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm">
                      <div className="font-semibold text-blue-900">{af.user_name}</div>
                      <p className="text-slate-700 mt-0.5">{af.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
