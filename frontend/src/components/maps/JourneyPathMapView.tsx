'use client';

import React, { useMemo } from 'react';
import Map3DView from './Map3DView';
import type { ActiveBusData } from '@/lib/map3d/threeMapLayer';
import { Calendar, CheckCircle2, Flag } from 'lucide-react';

interface Props {
  path: { lat: number; lng: number; timestamp: string }[];
  heightClass?: string;
}

export default function JourneyPathMapView({
  path,
  heightClass = 'h-[500px]',
}: Props) {
  // Convert path to routePath [lng, lat][]
  const routePath: [number, number][] = useMemo(() => {
    return path.map((p) => [p.lng, p.lat]);
  }, [path]);

  // Place 3D miniature bus at the destination or current point
  const activeBuses: ActiveBusData[] = useMemo(() => {
    if (path.length === 0) return [];
    const last = path[path.length - 1];
    const prev = path.length > 1 ? path[path.length - 2] : last;

    let computedHeading = 0;
    if (path.length > 1) {
      const dLng = last.lng - prev.lng;
      const dLat = last.lat - prev.lat;
      computedHeading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      if (computedHeading < 0) computedHeading += 360;
    }

    return [
      {
        id: 7777,
        busNumber: 'REPLAY BUS',
        routeName: 'Historical Journey Replay',
        latitude: last.lat,
        longitude: last.lng,
        heading: computedHeading,
        speed: 12,
        accentColor: '#10b981', // Emerald green
      },
    ];
  }, [path]);

  const startTime = path.length > 0 ? new Date(path[0].timestamp).toLocaleTimeString() : null;
  const endTime =
    path.length > 1 ? new Date(path[path.length - 1].timestamp).toLocaleTimeString() : null;

  return (
    <div className="relative w-full">
      <Map3DView
        buses={activeBuses}
        routePath={routePath}
        focusedBusId={path.length > 0 ? 7777 : null}
        heightClass={heightClass}
        showOverlayCards={false}
      />

      {/* Floating Replay Info Ribbon */}
      {path.length > 0 && (
        <div className="absolute bottom-4 left-5 z-20 flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/15 text-white shadow-xl text-xs font-semibold flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Start: {startTime}</span>
          </div>

          {endTime && (
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/15 text-white shadow-xl text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>End: {endTime}</span>
            </div>
          )}

          <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/15 text-slate-300 shadow-xl text-xs font-semibold flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>{path.length} Recorded GPS Fixes</span>
          </div>
        </div>
      )}
    </div>
  );
}
