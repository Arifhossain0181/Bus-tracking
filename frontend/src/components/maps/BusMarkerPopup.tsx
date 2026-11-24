'use client';

import React from 'react';
import {
  Clock,
  Gauge,
  MapPin,
  Navigation,
  User as UserIcon,
  X,
} from 'lucide-react';

export interface BusPopupData {
  id: number;
  busNumber: string;
  licensePlate?: string;
  driverName?: string;
  speedKmh: number;
  latitude: number;
  longitude: number;
  routeName?: string;
  status: 'live' | 'moving' | 'stopped' | 'stale' | 'offline';
  lastUpdated: string;
  currentLocationName?: string;
  userDistanceKm?: number | null;
  userTravelMinutes?: number | null;
}

interface BusMarkerPopupProps {
  data: BusPopupData;
  onClose?: () => void;
  onFollow?: (id: number) => void;
  isFollowing?: boolean;
}

export default function BusMarkerPopup({
  data,
  onClose,
  onFollow,
  isFollowing = false,
}: BusMarkerPopupProps) {
  const statusColors = {
    live: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    moving: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    stopped: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    stale: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    offline: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
  };

  const statusLabels = {
    live: 'LIVE',
    moving: 'MOVING',
    stopped: 'STOPPED',
    stale: 'STALE',
    offline: 'OFFLINE',
  };

  return (
    <div className="w-72 bg-slate-950/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-4 text-white shadow-2xl space-y-3 font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold">
            <Navigation className="w-4 h-4 rotate-45" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-white tracking-wide">{data.busNumber}</h4>
            <p className="text-[10px] text-slate-400">
              {data.licensePlate || 'Reg: Pending'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[data.status]}`}
          >
            {statusLabels[data.status]}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Information Rows */}
      <div className="space-y-2 py-1">
        {/* User-to-Bus Guidance Distance & Travel Time */}
        {data.userDistanceKm != null && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-xl">
            <span className="text-amber-300 font-bold flex items-center gap-1.5 text-[11px]">
              <Navigation className="w-3.5 h-3.5 text-amber-400" />
              From You:
            </span>
            <span className="font-extrabold text-amber-300 text-[11px]">
              {data.userDistanceKm < 1
                ? `${Math.round(data.userDistanceKm * 1000)}m away`
                : `${data.userDistanceKm.toFixed(1)} km away`}
              {data.userTravelMinutes != null && (
                <span className="text-white font-normal ml-1">
                  (~{data.userTravelMinutes} min)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Current Location / Landmark */}
        {data.currentLocationName && (
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Current Area:
            </span>
            <span className="font-bold text-emerald-300 text-right truncate max-w-[140px]" title={data.currentLocationName}>
              {data.currentLocationName}
            </span>
          </div>
        )}

        {/* Route */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            Assigned Route:
          </span>
          <span className="font-semibold text-slate-200 text-right truncate max-w-[130px]">
            {data.routeName || 'Unassigned'}
          </span>
        </div>

        {/* Driver */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-blue-400" />
            Driver:
          </span>
          <span className="font-medium text-slate-200">{data.driverName || 'N/A'}</span>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            Current Speed:
          </span>
          <span className="font-bold text-emerald-400">{data.speedKmh} km/h</span>
        </div>

        {/* GPS Coordinates */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-indigo-400" />
            GPS Fix:
          </span>
          <span className="font-mono text-[11px] text-slate-300">
            {data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}
          </span>
        </div>

        {/* Last Updated */}
        <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            Last Updated:
          </span>
          <span>{data.lastUpdated}</span>
        </div>
      </div>

      {/* Action: Follow Button */}
      {onFollow && (
        <button
          type="button"
          onClick={() => onFollow(data.id)}
          className={`w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
            isFollowing
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>{isFollowing ? 'Tracking Bus (Locked)' : 'Follow This Bus in 3D'}</span>
        </button>
      )}
    </div>
  );
}
