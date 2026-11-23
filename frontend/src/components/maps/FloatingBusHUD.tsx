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
  etaMinutes = null,
  routeProgressPercent = 0,
  lastUpdatedFormatted = 'Just now',
  isConnected = false,
  statusText = 'OFFLINE',
  isFollowing = false,
  onToggleFollow,
}: FloatingBusHUDProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-[94%] max-w-4xl pointer-events-auto">
      <div className="bg-slate-950/85 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl p-4 md:p-5 text-white transition-all duration-300">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold text-sm shadow-inner">
              {busNumber.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 5) || 'BUS'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm md:text-base text-white tracking-wide">
                  {busNumber}
                </h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-300">
                  {routeName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                <span>{origin}</span>
                <span className="text-cyan-400">&rarr;</span>
                <span className="text-slate-300 font-medium">{destination}</span>
                <span className="text-slate-600 hidden sm:inline">&bull;</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-700/90 text-white font-extrabold text-[10px] tracking-wide shadow-sm border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-white shadow-sm inline-block" />
                  <span>{currentLocationName || 'Dhaka'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Connection Status Badge */}
            <div
              className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border ${
                isConnected
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-sm shadow-emerald-500/20'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                }`}
              />
              <Radio className="w-3 h-3" />
              <span>{statusText}</span>
            </div>

            {/* Follow Bus Button */}
            {onToggleFollow && (
              <button
                type="button"
                onClick={onToggleFollow}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition flex items-center gap-1.5 ${
                  isFollowing
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                <Navigation className="w-3 h-3" />
                <span>{isFollowing ? 'Tracking' : 'Follow'}</span>
              </button>
            )}

            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Dynamic Metric Grid */}
        {isExpanded && (
          <div className="mt-4 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {/* 1. BUS SPEED */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Bus Speed</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {speedKmh != null ? speedKmh : '—'}
                  </span>
                  {speedKmh != null && (
                    <span className="text-xs font-semibold text-slate-400">km/h</span>
                  )}
                </div>
              </div>

              {/* 2. CURRENT LOCATION & NEXT STOP */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    Current Location
                  </span>
                </div>
                <div className="mt-1">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-extrabold text-sm md:text-base tracking-tight truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm" />
                    <span className="truncate" title={currentLocationName || 'Dhaka'}>
                      {currentLocationName || 'Dhaka'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    Next: <span className="text-slate-200 font-semibold">{nextStopName}</span>
                  </div>
                </div>
              </div>

              {/* 3. DISTANCE */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>Distance</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {distanceToNextKm != null
                      ? distanceToNextKm === 0
                        ? '0'
                        : distanceToNextKm.toFixed(1)
                      : '—'}
                  </span>
                  {distanceToNextKm != null && (
                    <span className="text-xs font-semibold text-slate-400">
                      {distanceToNextKm === 0 ? 'At stop' : 'km away'}
                    </span>
                  )}
                </div>
              </div>

              {/* 4. ETA */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>ETA</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl md:text-2xl font-black text-amber-300 tracking-tight">
                    {etaMinutes != null
                      ? etaMinutes === 0
                        ? 'Due'
                        : `${etaMinutes}`
                      : 'Calculating…'}
                  </span>
                  {etaMinutes != null && etaMinutes > 0 && (
                    <span className="text-xs font-semibold text-slate-400">
                      {etaMinutes === 1 ? 'minute' : 'minutes'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ROUTE PROGRESS BAR */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">ROUTE PROGRESS:</span>
                  <span className="text-cyan-400 font-extrabold">{routeProgressPercent}%</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span>Last update: {lastUpdatedFormatted}</span>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="w-full h-2.5 rounded-full bg-slate-900 border border-white/10 overflow-hidden relative">
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
