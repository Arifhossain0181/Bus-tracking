'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Bus } from '@/lib/types';

const BusFollowMapView = dynamic(() => import('@/components/maps/BusFollowMapView'), {
  ssr: false,
  loading: () => <div className="h-[480px] rounded-xl bg-slate-200 animate-pulse" />,
});

export default function FollowBusPage() {
  const params = useParams();
  const id = params?.id as string;
  const [bus, setBus] = useState<Bus | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [statusLabel, setStatusLabel] = useState('Tracking...');

  const pollBus = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<Bus>(`/api/buses/${id}/`);
      setBus(data);
      if (data.latest_location) {
        const lat = Number(data.latest_location.latitude);
        const lng = Number(data.latest_location.longitude);
        setTrail((prev) => {
          const last = prev[prev.length - 1];
          if (last && last[0] === lat && last[1] === lng) return prev;
          return [...prev, [lat, lng]];
        });
        setStatusLabel('Active');
      } else {
        setStatusLabel('No GPS Fix');
      }
    } catch {
      setStatusLabel('Connection Lost');
    }
  }, [id]);

  useEffect(() => {
    pollBus();
    const timer = setInterval(pollBus, 3000);
    return () => clearInterval(timer);
  }, [pollBus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/buses" className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Following Bus {bus?.bus_number || `#${id}`}
            </h1>
            <p className="text-sm text-slate-500">
              Route: {bus?.route_name || 'Unassigned'} &middot; Auto-refresh every 3s
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            statusLabel === 'Active'
              ? 'bg-emerald-100 text-emerald-700'
              : statusLabel === 'Connection Lost'
              ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <BusFollowMapView
        latitude={bus?.latest_location ? Number(bus.latest_location.latitude) : null}
        longitude={bus?.latest_location ? Number(bus.latest_location.longitude) : null}
        busNumber={bus?.bus_number || 'BUS'}
        trail={trail}
      />
    </div>
  );
}
