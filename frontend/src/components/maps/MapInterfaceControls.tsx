'use client';

import React, { useState } from 'react';
import {
  Compass,
  Crosshair,
  Eye,
  Layers,
  Maximize,
  Minimize,
  Minus,
  Navigation2,
  Plus,
  RadioTower,
} from 'lucide-react';
import { SATELLITE_IMAGERY_ENABLED } from '@/lib/mapConfig';

export type MapLayerPreset = 'liberty' | 'bright' | 'dark' | 'satellite' | 'mapbox-satellite' | 'voyager';

export interface MapInterfaceControlsProps {
  selectedBusNumber?: string;
  selectedRouteName?: string;
  isLiveTracking?: boolean;
  is3DMode: boolean;
  isFollowing: boolean;
  activeLayer: MapLayerPreset;
  onToggle3D: () => void;
  onToggleFollow: () => void;
  onSelectLayer: (layer: MapLayerPreset) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  onLocateBus: () => void;
  onShowAllBuses: () => void;
  onLocateUser?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export default function MapInterfaceControls({
  selectedBusNumber,
  selectedRouteName,
  isLiveTracking = true,
  is3DMode,
  isFollowing,
  activeLayer,
  onToggle3D,
  onToggleFollow,
  onSelectLayer,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  onLocateBus,
  onShowAllBuses,
  onLocateUser,
  isFullscreen = false,
  onToggleFullscreen,
}: MapInterfaceControlsProps) {
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  return (
    <>
      {/* 1. TOP-LEFT: Selected Bus Information Card */}
      {selectedBusNumber && (
        <div className="absolute top-4 left-4 z-20 pointer-events-auto">
          <div className="px-4 py-2.5 rounded-2xl bg-slate-950/85 backdrop-blur-2xl border border-white/15 text-white shadow-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold">
              <Navigation2 className="w-4 h-4 rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white tracking-wide">
                  {selectedBusNumber}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                    isLiveTracking
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  }`}
                >
                  {isLiveTracking ? 'LIVE' : 'IDLE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {selectedRouteName || 'Active Transit Run'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. TOP-RIGHT: Follow, 2D/3D, Layer Selection, Fullscreen */}
      <div className="absolute top-4 right-4 z-20 pointer-events-auto flex items-center gap-2">
        {/* Follow / Unfollow Toggle */}
        <button
          type="button"
          onClick={onToggleFollow}
          title={isFollowing ? 'Unfollow Bus' : 'Follow Selected Bus'}
          className={`h-10 px-3.5 rounded-2xl backdrop-blur-2xl border text-xs font-bold transition flex items-center gap-1.5 shadow-2xl ${
            isFollowing
              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-cyan-500/30'
              : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-white/15'
          }`}
        >
          <RadioTower className="w-4 h-4" />
          <span className="hidden sm:inline">{isFollowing ? 'Unfollow' : 'Follow'}</span>
        </button>

        {/* 2D / 3D Toggle */}
        <button
          type="button"
          onClick={onToggle3D}
          title={is3DMode ? 'Switch to 2D Top-Down' : 'Switch to 3D Isometric View'}
          className={`h-10 px-3 rounded-2xl backdrop-blur-2xl border font-black text-xs transition flex items-center justify-center shadow-2xl ${
            is3DMode
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 border-cyan-400 shadow-cyan-500/30'
              : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-white/15'
          }`}
        >
          {is3DMode ? '3D' : '2D'}
        </button>

        {/* Map Layer Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            title="Map Layer Styles"
            className="w-10 h-10 rounded-2xl bg-slate-950/85 backdrop-blur-2xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 transition"
          >
            <Layers className="w-4 h-4" />
          </button>

          {showLayerMenu && (
            <div className="absolute right-0 top-12 w-52 bg-slate-950/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl py-2 text-xs text-white z-50">
              <div className="px-3 py-1 font-semibold text-slate-400 border-b border-white/10 mb-1">
                GIS Layer Engine
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectLayer('liberty');
                  setShowLayerMenu(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between rounded-xl transition ${
                  activeLayer === 'liberty' || activeLayer === 'satellite' ? 'text-cyan-400 font-bold bg-white/5' : ''
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-bold">OpenFreeMap Liberty</span>
                  <span className="text-[10px] text-cyan-300">Default Pilot Vector Basemap</span>
                </div>
                {(activeLayer === 'liberty' || activeLayer === 'satellite') && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectLayer('bright');
                  setShowLayerMenu(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between rounded-xl transition ${
                  activeLayer === 'bright' ? 'text-cyan-400 font-bold bg-white/5' : ''
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-bold">OpenFreeMap Bright</span>
                  <span className="text-[10px] text-slate-400">High-Contrast Street Map</span>
                </div>
                {activeLayer === 'bright' && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
              </button>
              {SATELLITE_IMAGERY_ENABLED && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectLayer('mapbox-satellite');
                    setShowLayerMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between rounded-xl transition ${
                    activeLayer === 'mapbox-satellite' ? 'text-cyan-400 font-bold bg-white/5' : ''
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold">Esri World Imagery</span>
                    <span className="text-[10px] text-slate-400">Photographic Aerial (Esri)</span>
                  </div>
                  {activeLayer === 'mapbox-satellite' && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onSelectLayer('dark');
                  setShowLayerMenu(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between rounded-xl transition ${
                  activeLayer === 'dark' ? 'text-cyan-400 font-bold bg-white/5' : ''
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-bold">Dark Neon</span>
                  <span className="text-[10px] text-slate-400">Night Cyberpunk Mode</span>
                </div>
                {activeLayer === 'dark' && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />}
              </button>
            </div>
          )}
        </div>

        {/* Fullscreen Toggle Button */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
            className="w-10 h-10 rounded-2xl bg-slate-950/85 backdrop-blur-2xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 transition"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* 3. RIGHT FLOATING CONTROLS: Zoom, Locate, Show All, Reset Camera */}
      <div className="absolute top-20 right-4 z-20 pointer-events-auto flex flex-col gap-2">
        {/* Zoom Controls Pill */}
        <div className="flex flex-col rounded-2xl bg-slate-950/85 backdrop-blur-2xl border border-white/15 shadow-2xl overflow-hidden">
          <button
            type="button"
            onClick={onZoomIn}
            title="Zoom In"
            className="w-10 h-10 text-slate-200 flex items-center justify-center hover:bg-white/20 hover:text-white transition"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            type="button"
            onClick={onZoomOut}
            title="Zoom Out"
            className="w-10 h-10 text-slate-200 flex items-center justify-center hover:bg-white/20 hover:text-white transition"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* Reset Camera (North Bearing) */}
        <button
          type="button"
          onClick={onResetCamera}
          title="Reset Camera (Heading North)"
          className="w-10 h-10 rounded-2xl bg-slate-950/85 backdrop-blur-2xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-white transition"
        >
          <Navigation2 className="w-4 h-4 text-slate-300" />
        </button>

        {/* Locate Selected Bus */}
        <button
          type="button"
          onClick={onLocateBus}
          title="Focus Selected Bus"
          className="w-10 h-10 rounded-2xl bg-slate-950/85 backdrop-blur-2xl text-cyan-400 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-cyan-300 transition"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Show All Buses (Fit Bounds) */}
        <button
          type="button"
          onClick={onShowAllBuses}
          title="Show Entire Fleet (Fit Bounds)"
          className="w-10 h-10 rounded-2xl bg-slate-950/85 backdrop-blur-2xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-white transition"
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* Locate User */}
        {onLocateUser && (
          <button
            type="button"
            onClick={onLocateUser}
            title="My Current Location"
            className="w-10 h-10 rounded-2xl bg-slate-950/85 backdrop-blur-2xl text-blue-400 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-blue-300 transition"
          >
            <Compass className="w-4 h-4" />
          </button>
        )}
      </div>
    </>
  );
}
