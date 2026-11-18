'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { ArrowLeft, Navigation } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, isRegularUser } from '@/lib/api';
import type { Bus } from '@/lib/types';

const MiniLocationMap = dynamic(() => import('@/components/maps/MiniLocationMap'), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl bg-slate-200 animate-pulse" />,
});

export default function BusDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const id = params?.id as string;
  const [bus, setBus] = useState<Bus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<Bus>(`/api/buses/${id}/`)
      .then(setBus)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-500">Loading bus...</div>;
  if (!bus) return <div className="py-12 text-center text-sm text-red-600">Bus not found.</div>;

  const regular = isRegularUser(user?.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/buses" className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bus {bus.bus_number}</h1>
            <p className="text-sm text-slate-500">
              {bus.license_plate} &middot; {bus.bus_type_display}
            </p>
          </div>
        </div>
        <Link
          href={`/buses/${bus.id}/follow`}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5"
        >
          <Navigation className="w-4 h-4" />
          Track This Bus
        </Link>
      </div>

      {regular ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-bold text-slate-900 mb-3">
            Assigned Route Trips ({bus.route_name || 'Unassigned'})
          </h2>
          {!bus.current_route_trips?.length ? (
            <p className="text-sm text-slate-500">No trips scheduled for this bus.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Trip</th>
                  <th className="py-2">Departure</th>
                  <th className="py-2">Arrival</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bus.current_route_trips.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 font-semibold">Trip {t.formatted_trip_number}</td>
                    <td className="py-2 text-blue-700">{t.departure_time || '--'}</td>
                    <td className="py-2 text-slate-600">{t.arrival_time || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2 text-sm">
            <h2 className="font-bold text-slate-900 mb-2">Bus Information</h2>
            <div>Capacity: <strong>{bus.capacity}</strong></div>
            <div>Model: <strong>{bus.model || '--'}</strong></div>
            <div>Year: <strong>{bus.year || '--'}</strong></div>
            <div>Route: <strong className="text-blue-700">{bus.route_name || 'Unassigned'}</strong></div>
            <div>Driver: <strong>{bus.active_assignment?.driver_name || 'Unassigned'}</strong></div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-slate-900">Latest Known Location</h2>
            <MiniLocationMap
              latitude={bus.latest_location ? Number(bus.latest_location.latitude) : null}
              longitude={bus.latest_location ? Number(bus.latest_location.longitude) : null}
              heightClass="h-72"
            />
          </div>

          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-bold text-slate-900 mb-3">Recent Assignments</h2>
            {!bus.recent_assignments?.length ? (
              <p className="text-sm text-slate-500">No assignments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2">Date</th>
                      <th className="py-2">Driver</th>
                      <th className="py-2">Route</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bus.recent_assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2">{a.date || '--'}</td>
                        <td className="py-2 font-medium">{a.driver_name}</td>
                        <td className="py-2">{a.route_name}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {a.is_active ? 'Active' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
