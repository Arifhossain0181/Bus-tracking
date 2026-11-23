'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  MapPin,
  Navigation,
  Radio,
  TrendingUp,
  Wifi,
} from 'lucide-react';

export interface FloatingBusHUDProps {
  busNumber: string;
  routeName?: string;
  origin?: string;
  destination?: string;
  speedKmh?: number | null;
  currentLocationName?: string;
  nextStopName?: string;
  distanceToNextKm?: number | null;
  userDistanceKm?: number | null;
  userTravelMinutes?: number | null;
  etaMinutes?: number | null;
  routeProgressPercent: number;
  lastUpdatedFormatted: string;
  isConnected: boolean;
  statusText?: string;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
}

export default function FloatingBusHUD({
  busNumber,
  routeName = 'Transit Line',
  origin = 'Campus',
  destination = 'Destination',
  speedKmh = null,
  currentLocationName,
  nextStopName,
  distanceToNextKm = null,
  userDistanceKm = null,
  userTravelMinutes = null,
  etaMinutes = null,
  routeProgressPercent = 0,
  lastUpdatedFormatted = 'Just now',
  isConnected = false,
  statusText = 'OFFLINE',
  isFollowing = false,
  onToggleFollow,
}: FloatingBusHUDProps) {
  // Mobile-friendly: default to collapsed or compact bar on small screens to avoid covering map
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 w-[96%] max-w-3xl pointer-events-auto">
      <div className="bg-slate-950/90 backdrop-blur-xl border border-white/15 rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-4 text-white transition-all duration-300">
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold text-xs sm:text-sm shadow-inner shrink-0">
              {busNumber.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 5) || 'BUS'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-extrabold text-xs sm:text-sm text-white tracking-wide truncate">
                  {busNumber}
                </h3>
                <span className="hidden xs:inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-slate-300 truncate max-w-[120px]">
                  {routeName}
                </span>
                {/* Distance and Travel Time pill in header for instant visibility without expanding */}
                {userDistanceKm != null && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                    <span>
                      {userDistanceKm < 1
                        ? `${Math.round(userDistanceKm * 1000)}m away`
                        : `${userDistanceKm.toFixed(1)} km away`}
                    </span>
                    {userTravelMinutes != null && (
                      <span className="text-amber-300 font-extrabold border-l border-cyan-500/40 pl-1">
                        ~{userTravelMinutes} min
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-700/80 text-white font-bold text-[9px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white inline-block shrink-0" />
                  <span className="truncate max-w-[100px] sm:max-w-none">{currentLocationName || 'Dhaka'}</span>
                </span>
                <span className="text-slate-500">&bull;</span>
                <span className="truncate text-slate-300">
                  {speedKmh != null ? `${speedKmh} km/h` : 'Live GPS'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live Connection Status Badge */}
            <div
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                isConnected
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                }`}
              />
              <span className="hidden sm:inline">{statusText}</span>
              <span className="sm:hidden">{isConnected ? 'LIVE' : 'OFF'}</span>
            </div>

            {/* Follow Bus Button */}
            {onToggleFollow && (
              <button
                type="button"
                onClick={onToggleFollow}
                className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition flex items-center gap-1 ${
                  isFollowing
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
                title={isFollowing ? 'Click to unlock camera' : 'Lock camera on bus'}
              >
                <Navigation className="w-3 h-3" />
                <span className="hidden xs:inline">{isFollowing ? 'Tracking' : 'Follow'}</span>
              </button>
            )}

            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 sm:p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition"
              aria-label={isExpanded ? 'Collapse HUD' : 'Expand HUD'}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Dynamic Metric Grid */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-3 animate-fade-in text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {/* 1. BUS SPEED */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-medium">
                  <Gauge className="w-3 h-3 text-cyan-400" />
                  <span>Bus Speed</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black text-white">
                    {speedKmh != null ? speedKmh : '—'}
                  </span>
                  {speedKmh != null && <span className="text-[10px] text-slate-400">km/h</span>}
                </div>
              </div>

              {/* 2. CURRENT LOCATION & NEXT STOP */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-medium">
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  <span>Location</span>
                </div>
                <div className="mt-1 truncate">
                  <span className="text-emerald-300 font-bold text-xs sm:text-sm truncate block" title={currentLocationName || 'Dhaka'}>
                    {currentLocationName || 'Dhaka'}
                  </span>
                  <span className="text-[9px] text-slate-400 truncate block">
                    Next: {nextStopName || '—'}
                  </span>
                </div>
              </div>

              {/* 3. DISTANCE */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-medium">
                  <TrendingUp className="w-3 h-3 text-blue-400" />
                  <span>{userDistanceKm != null ? 'From You' : 'Distance'}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black text-white">
                    {userDistanceKm != null
                      ? userDistanceKm < 1
                        ? Math.round(userDistanceKm * 1000)
                        : userDistanceKm.toFixed(1)
                      : distanceToNextKm != null
                      ? distanceToNextKm.toFixed(1)
                      : '—'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {userDistanceKm != null ? (userDistanceKm < 1 ? 'm' : 'km') : 'km'}
                  </span>
                </div>
              </div>

              {/* 4. ETA & TRAVEL TIME */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-medium">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>{userTravelMinutes != null ? 'Travel Time' : 'ETA'}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black text-amber-300">
                    {userTravelMinutes != null
                      ? userTravelMinutes === 0
                        ? '< 1 min'
                        : `${userTravelMinutes} min`
                      : etaMinutes != null
                      ? etaMinutes === 0
                        ? 'Due'
                        : `${etaMinutes}m`
                      : 'Calculating…'}
                  </span>
                  {userTravelMinutes != null && etaMinutes != null && (
                    <span className="text-[9px] text-slate-400">
                      (Next: {etaMinutes}m)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ROUTE PROGRESS BAR */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300 mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">PROGRESS:</span>
                  <span className="text-cyan-400 font-extrabold">{routeProgressPercent}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{lastUpdatedFormatted}</span>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="w-full h-1.5 sm:h-2 rounded-full bg-slate-900 border border-white/10 overflow-hidden relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/30 transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(5, routeProgressPercent))}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
