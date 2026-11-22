'use client';

import React, { useMemo } from 'react';
import type { Stop } from '@/lib/types';
import Map3DView, { type StopPoint } from './Map3DView';

interface Props {
  stops: Stop[];
  color?: string;
  onMapClick?: (lat: number, lng: number) => void;
  pickedCoords?: [number, number] | null;
  heightClass?: string;
}

export default function RouteMapView({
  stops,
  onMapClick,
  pickedCoords,
  heightClass = 'h-96',
}: Props) {
  // Convert stops to route path [lng, lat][]
  const routePath: [number, number][] = useMemo(() => {
    return stops
      .filter((s) => s.latitude && s.longitude)
      .map((s) => [Number(s.longitude), Number(s.latitude)]);
  }, [stops]);

  // Convert stops to StopPoint[]
  const stopPoints: StopPoint[] = useMemo(() => {
    return stops.map((s) => ({
      id: s.id,
      name: s.name,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      order: s.order,
      scheduledTime: s.scheduled_time,
      isMajor: s.is_major_stop,
    }));
  }, [stops]);

  return (
    <div className="relative w-full">
      <Map3DView
        routePath={routePath}
        stops={stopPoints}
        heightClass={heightClass}
        onMapClick={onMapClick}
        showOverlayCards={false}
      />

      {pickedCoords && (
        <div className="absolute bottom-4 left-5 z-20 px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-cyan-500/40 text-xs font-semibold text-cyan-300 shadow-xl flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span>
            Selected: {pickedCoords[0].toFixed(5)}, {pickedCoords[1].toFixed(5)}
          </span>
        </div>
      )}
    </div>
  );
}
