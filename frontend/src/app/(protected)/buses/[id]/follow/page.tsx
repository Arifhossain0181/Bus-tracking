'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { ArrowLeft, WifiOff, AlertTriangle, Navigation, Gauge, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Bus } from '@/lib/types';
import {
  determineFollowBusStatus,
  isValidCoordinate,
  formatAgeDescription,
} from '@/lib/trackingStatus';

const BusFollowMapView = dynamic(() => import('@/components/maps/BusFollowMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center animate-pulse">
      <div className="text-sm font-medium text-slate-400">Loading interactive map...</div>
    </div>
  ),
});

const POLLING_INTERVAL_MS = 3000;

export default function FollowBusPage() {
  const params = useParams();
  const id = params?.id as string;

  const [bus, setBus] = useState<Bus | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectionError, setIsConnectionError] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const trailInitializedRef = useRef(false);

  // 1-second timer to update relative age & status in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reliable, non-overlapping API polling
  useEffect(() => {
    if (!id) return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    let requestInFlight = false;

    const fetchBusTelemetry = async () => {
      if (!isMounted || requestInFlight) return;
      requestInFlight = true;

      try {
        const data = await apiFetch<Bus>(`/api/buses/${id}/`);
        if (!isMounted) return;

        setBus(data);
        setIsConnectionError(false);
        setIsLoading(false);

        // Pre-seed trail on first successful fetch from recent_locations
        if (!trailInitializedRef.current && data.recent_locations && data.recent_locations.length > 0) {
          trailInitializedRef.current = true;
          const initialPoints: [number, number][] = [];
          const chronological = [...data.recent_locations].reverse();
          for (const loc of chronological) {
            const lat = Number(loc.latitude);
            const lng = Number(loc.longitude);
            if (isValidCoordinate(lat, lng)) {
              const last = initialPoints[initialPoints.length - 1];
              if (!last || Math.abs(last[0] - lat) >= 0.00001 || Math.abs(last[1] - lng) >= 0.00001) {
                initialPoints.push([lat, lng]);
              }
            }
          }
          if (initialPoints.length > 0) {
            setTrail(initialPoints);
          }
        }

        // Append new live coordinate to trail
        if (data.latest_location) {
          const lat = Number(data.latest_location.latitude);
          const lng = Number(data.latest_location.longitude);
          if (isValidCoordinate(lat, lng)) {
            setTrail((prev) => {
              const last = prev[prev.length - 1];
              // Avoid duplicate identical points
              if (last && Math.abs(last[0] - lat) < 0.00001 && Math.abs(last[1] - lng) < 0.00001) {
                return prev;
              }
              const next = [...prev, [lat, lng] as [number, number]];
              return next.length > 100 ? next.slice(-100) : next;
            });
          }
        }
      } catch {
        if (!isMounted) return;
        setIsConnectionError(true);
        setIsLoading(false);
      } finally {
        requestInFlight = false;
        if (isMounted) {
          timeoutId = setTimeout(fetchBusTelemetry, POLLING_INTERVAL_MS);
        }
      }
    };

    fetchBusTelemetry();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id]);

  // Derived tracking status info
  const statusInfo = useMemo(() => {
    return determineFollowBusStatus({
      bus,
      isLoading,
      isConnectionError,
      nowMs: now,
    });
  }, [bus, isLoading, isConnectionError, now]);

  const latestLocation = bus?.latest_location;
  const rawSpeed = latestLocation?.speed != null ? Number(latestLocation.speed) : null;
  const speedKmh = rawSpeed != null && !isNaN(rawSpeed) ? Math.round(rawSpeed * 3.6) : null;
  const headingDeg = latestLocation?.heading != null ? Number(latestLocation.heading) : null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8">
      {/* Network Alert Banner */}
      {isConnectionError && bus && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium animate-pulse">
          <WifiOff className="w-4 h-4 shrink-0 text-rose-600" />
          <span>Telemetry connection interrupted. Showing last received position while attempting to reconnect...</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/buses"
            className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
            title="Back to buses"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">
                Following Bus {bus?.bus_number || `#${id}`}
              </h1>
              {/* Status Badge */}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.badgeClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
                {statusInfo.label}
              </div>

              {/* Accuracy Alert Badge */}
              {!statusInfo.isAccurate && (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Degraded Accuracy
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-1">
              Route: <span className="font-medium text-slate-700">{bus?.route_name || 'Unassigned'}</span>
              <span className="mx-2 text-slate-300">&bull;</span>
              {statusInfo.description}
            </p>
          </div>
        </div>

        {/* Telemetry quick stats */}
        <div className="flex items-center gap-3 text-xs">
          {speedKmh != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <Gauge className="w-3.5 h-3.5 text-slate-500" />
              <span>{speedKmh} km/h</span>
            </div>
          )}

          {headingDeg != null && !isNaN(headingDeg) && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <Navigation
                className="w-3.5 h-3.5 text-slate-500"
                style={{ transform: `rotate(${headingDeg}deg)` }}
              />
              <span>{Math.round(headingDeg)}&deg;</span>
            </div>
          )}

          {statusInfo.ageSeconds != null && (
            <div className="flex items-center gap-1 text-slate-500 font-mono text-[11px]" title="GPS age">
              <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
              <span>{formatAgeDescription(statusInfo.ageSeconds)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Map */}
      <BusFollowMapView
        latitude={latestLocation ? Number(latestLocation.latitude) : null}
        longitude={latestLocation ? Number(latestLocation.longitude) : null}
        busNumber={bus?.bus_number || 'BUS'}
        trail={trail}
        heading={headingDeg}
        speed={rawSpeed}
        isAccurate={statusInfo.isAccurate}
        routeName={bus?.route_name || undefined}
      />
    </div>
  );
}
