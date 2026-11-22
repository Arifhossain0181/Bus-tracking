'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  Compass,
  Layers,
  Play,
  Pause,
  RotateCcw,
  Box,
  Eye,
  Sliders,
  Sparkles,
  Info,
  Radio,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Bus } from '@/lib/types';
import {
  MOCK_CAMPUS_ROUTE,
  CAMERA_PRESETS,
  MAP_STYLES,
  interpolatePositionOnRoute,
  type CameraPreset,
} from '@/lib/maplibreUtils';
import { getCardinalDirection } from '@/lib/trackingStatus';

const MapLibreExperimentalView = dynamic(
  () => import('@/components/maps/MapLibreExperimentalView'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center animate-pulse text-slate-400">
        <Box className="w-8 h-8 mb-2 animate-bounce text-indigo-400" />
        <span className="text-sm font-medium">Initializing WebGL 3D Map Engine...</span>
      </div>
    ),
  }
);

export default function MapLibreExperimentalPage() {
  // Mode: 'simulated' vs 'live'
  const [dataSource, setDataSource] = useState<'simulated' | 'live'>('simulated');
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);

  // Camera settings
  const [pitch, setPitch] = useState<number>(55);
  const [bearing, setBearing] = useState<number>(40);
  const [zoom, setZoom] = useState<number>(16);
  const [liveCamera, setLiveCamera] = useState({ pitch: 55, bearing: 40, zoom: 16 });

  // Style setting
  const [mapStyleId, setMapStyleId] = useState<string>('openfreemap-liberty');

  // Simulation playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [progress, setProgress] = useState<number>(0);

  // Vehicle state
  const [busLocation, setBusLocation] = useState({
    lat: 23.8155,
    lng: 90.4125,
    heading: 45,
    speed: 9.0, // m/s
    busNumber: 'BUS-3D',
  });

  const [trail, setTrail] = useState<[number, number][]>([]);
  const [followBus, setFollowBus] = useState<boolean>(true);

  // Fetch live buses for comparison mode
  useEffect(() => {
    apiFetch<Bus[]>('/api/buses/')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setBuses(list);
        if (list.length > 0 && !selectedBusId) {
          setSelectedBusId(list[0].id);
        }
      })
      .catch(() => {
        // Fallback to simulated if live API unreachable
      });
  }, [selectedBusId]);

  // Live polling when in 'live' mode
  useEffect(() => {
    if (dataSource !== 'live' || !selectedBusId) return;

    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const data = await apiFetch<Bus>(`/api/buses/${selectedBusId}/`);
        if (!isMounted) return;
        if (data.latest_location) {
          const lat = Number(data.latest_location.latitude);
          const lng = Number(data.latest_location.longitude);
          const heading = data.latest_location.heading ? Number(data.latest_location.heading) : 0;
          const speed = data.latest_location.speed ? Number(data.latest_location.speed) : 0;

          setBusLocation({
            lat,
            lng,
            heading,
            speed,
            busNumber: data.bus_number,
          });

          setTrail((prev) => {
            const next = [...prev, [lat, lng] as [number, number]];
            return next.length > 80 ? next.slice(-80) : next;
          });
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) timer = setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [dataSource, selectedBusId]);

  // Simulation animation loop
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    if (dataSource !== 'simulated' || !isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const step = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // 60 seconds per loop at 1x
      const loopDurationSeconds = 60 / simSpeed;
      setProgress((prev) => {
        const next = (prev + delta / loopDurationSeconds) % 1;
        const state = interpolatePositionOnRoute(MOCK_CAMPUS_ROUTE, next);

        setBusLocation({
          lat: state.lat,
          lng: state.lng,
          heading: Math.round(state.heading),
          speed: state.speed,
          busNumber: 'SIM-3D',
        });

        setTrail((tPrev) => {
          const last = tPrev[tPrev.length - 1];
          if (!last || Math.abs(last[0] - state.lat) > 0.0001 || Math.abs(last[1] - state.lng) > 0.0001) {
            const nextT = [...tPrev, [state.lat, state.lng] as [number, number]];
            return nextT.length > 100 ? nextT.slice(-100) : nextT;
          }
          return tPrev;
        });

        return next;
      });

      animRef.current = requestAnimationFrame(step);
    };

    lastTimeRef.current = performance.now();
    animRef.current = requestAnimationFrame(step);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [dataSource, isPlaying, simSpeed]);

  const applyPreset = (preset: CameraPreset) => {
    setPitch(preset.pitch);
    setBearing(preset.bearing);
    setZoom(preset.zoom);
  };

  const handleRecenter = useCallback(() => {
    setFollowBus(true);
  }, []);

  const speedKmh = Math.round(busLocation.speed * 3.6);
  const cardinal = getCardinalDirection(busLocation.heading);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 px-2 sm:px-4">
      {/* Experimental Prototype Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-700/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Task 007 &bull; Technology Spike
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                Experimental Sandbox
              </span>
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-300" />
              MapLibre GL JS 3D Prototype Evaluation
            </h1>
            <p className="text-xs text-indigo-200 max-w-2xl">
              Evaluating client-side WebGL vector rendering, camera tilt/pitch, 3D building extrusions,
              and performance differences compared to the current Leaflet production baseline.
            </p>
          </div>

          <Link
            href="/buses"
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Production Buses
          </Link>
        </div>
      </div>

      {/* Main Grid: Map & Control Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Interactive 3D Map View */}
        <div className="lg:col-span-3 space-y-4">
          {/* Top telemetry & camera HUD */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-semibold border border-indigo-200">
                <Box className="w-3.5 h-3.5 text-indigo-600" />
                <span>Pitch: {liveCamera.pitch}&deg;</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 font-medium border border-slate-200">
                <Compass className="w-3.5 h-3.5 text-slate-500" />
                <span>Bearing: {liveCamera.bearing}&deg;</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 font-medium border border-slate-200">
                <span>Zoom: {liveCamera.zoom}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                <span>Speed: {speedKmh} km/h</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 font-semibold border border-slate-200">
                <span>
                  Heading: {busLocation.heading}&deg; {cardinal}
                </span>
              </div>
              <button
                onClick={handleRecenter}
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                title="Recenter camera on bus"
              >
                Recenter
              </button>
            </div>
          </div>

          {/* Interactive MapLibre Map Component */}
          <MapLibreExperimentalView
            busLocation={busLocation}
            trail={trail}
            plannedRoute={MOCK_CAMPUS_ROUTE}
            is3D={pitch > 0}
            pitch={pitch}
            bearing={bearing}
            zoom={zoom}
            mapStyleId={mapStyleId}
            heightClass="h-[520px] md:h-[600px]"
            followBus={followBus}
            onCameraChange={(cam) => setLiveCamera(cam)}
          />

          {/* Interactive Gesture Guide */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                <strong>Desktop:</strong> Right-click + drag to tilt/rotate camera &bull;{' '}
                <strong>Mobile:</strong> Two-finger drag up/down to tilt, two-finger twist to rotate.
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              WebGL Hardware Accelerated
            </span>
          </div>
        </div>

        {/* Right Column: Prototype Control Console */}
        <div className="space-y-4">
          {/* Data Source Selector */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-indigo-600" />
              Telemetry Data Mode
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  setDataSource('simulated');
                  setTrail([]);
                }}
                className={`py-2 px-3 rounded-lg font-semibold border transition-all ${
                  dataSource === 'simulated'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Simulated Route
              </button>
              <button
                onClick={() => {
                  setDataSource('live');
                  setTrail([]);
                }}
                className={`py-2 px-3 rounded-lg font-semibold border transition-all ${
                  dataSource === 'live'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Live Bus API
              </button>
            </div>

            {dataSource === 'simulated' ? (
              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Playback:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                      {Math.round(progress * 100)}%
                    </span>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => {
                        setProgress(0);
                        setTrail([]);
                      }}
                      className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title="Restart Route"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Sim Speed:</span>
                  <div className="flex gap-1">
                    {[1, 2, 4].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSimSpeed(s)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          simSpeed === s ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                <label className="text-slate-500 block">Select Active Bus:</label>
                <select
                  value={selectedBusId || ''}
                  onChange={(e) => {
                    setSelectedBusId(Number(e.target.value));
                    setTrail([]);
                  }}
                  className="w-full p-2 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      Bus {b.bus_number} ({b.route_name || 'Unassigned'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Camera View Presets */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-indigo-600" />
              Camera Perspectives
            </h3>

            <div className="space-y-1.5">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-xs"
                >
                  <div className="font-semibold text-slate-800">{preset.label}</div>
                  <div className="text-[11px] text-slate-500">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Pitch & Bearing Sliders */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-600" />
              Fine-Tune Angles
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>Pitch (Tilt)</span>
                  <span className="font-mono font-semibold">{pitch}&deg;</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="75"
                  value={pitch}
                  onChange={(e) => setPitch(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>Bearing (Rotation)</span>
                  <span className="font-mono font-semibold">{bearing}&deg;</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={bearing}
                  onChange={(e) => setBearing(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setPitch(0);
                    setBearing(0);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px]"
                >
                  Reset North (2D)
                </button>
                <button
                  onClick={() => {
                    setPitch(60);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-[11px]"
                >
                  Quick 3D (60&deg;)
                </button>
              </div>
            </div>
          </div>

          {/* Map Style Selector */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              Vector Map Style
            </h3>

            <div className="space-y-1.5 text-xs">
              {MAP_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setMapStyleId(style.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    mapStyleId === style.id
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{style.name}</span>
                    {style.supports3DBuildings && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-800 font-bold">
                        3D
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{style.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Evaluation Findings & Technology Comparison */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-indigo-600" />
            Leaflet vs. MapLibre GL JS Technical Evaluation
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Empirical comparison conducted as part of UBus Task 007 architectural research.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-3">Criteria</th>
                <th className="py-2.5 px-3">Leaflet (Production)</th>
                <th className="py-2.5 px-3">MapLibre GL JS (Prototype)</th>
                <th className="py-2.5 px-3">Winner / Tradeoff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3 px-3 font-semibold">Existing Stability</td>
                <td className="py-3 px-3 text-emerald-700">Mature, battle-tested across all browsers, zero WebGL context loss risks.</td>
                <td className="py-3 px-3">High stability, but dependent on client GPU/WebGL driver support.</td>
                <td className="py-3 px-3 font-semibold text-emerald-800">Leaflet</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Live Tracking</td>
                <td className="py-3 px-3">Reliable marker updates via requestAnimationFrame and CSS transitions.</td>
                <td className="py-3 px-3 text-indigo-700">Native 60fps GPU coordinate rendering, smooth continuous camera tracking.</td>
                <td className="py-3 px-3 font-semibold text-indigo-800">MapLibre</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Marker Animation</td>
                <td className="py-3 px-3">Smooth DOM marker transforms; requires manual interpolation.</td>
                <td className="py-3 px-3">Supports both DOM markers and native WebGL symbol/icon layers.</td>
                <td className="py-3 px-3 font-semibold text-indigo-800">MapLibre</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Mobile Performance</td>
                <td className="py-3 px-3 text-emerald-700">Lightweight (~40KB gzip), minimal battery consumption, runs on low-end phones.</td>
                <td className="py-3 px-3">Heavier (~250KB gzip), requires GPU; higher battery and memory footprint.</td>
                <td className="py-3 px-3 font-semibold text-emerald-800">Leaflet</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">3D Buildings</td>
                <td className="py-3 px-3 text-slate-400">Not supported natively (2D flat raster only).</td>
                <td className="py-3 px-3 text-indigo-700 font-medium">Native fill-extrusion layers with dynamic heights and shadow depth.</td>
                <td className="py-3 px-3 font-semibold text-indigo-800">MapLibre</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Camera Pitch / Rotation</td>
                <td className="py-3 px-3 text-slate-400">Fixed top-down North-up orientation (no camera tilt).</td>
                <td className="py-3 px-3 text-indigo-700 font-medium">Full 0&deg;–85&deg; tilt and 360&deg; rotation via gestures and API.</td>
                <td className="py-3 px-3 font-semibold text-indigo-800">MapLibre</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Route Rendering</td>
                <td className="py-3 px-3">L.polyline with canvas or SVG overlay.</td>
                <td className="py-3 px-3">GPU-rendered vector lines, dashes, casings, and glow effects.</td>
                <td className="py-3 px-3 font-semibold text-indigo-800">MapLibre</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Custom Styling</td>
                <td className="py-3 px-3">Tied to pre-rendered raster tile sets.</td>
                <td className="py-3 px-3 text-indigo-700">Client-side vector styles: recolor roads, hide layers, dark mode on the fly.</td>
                <td className="py-3 px-3 font-semibold text-indigo-800">MapLibre</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Complexity</td>
                <td className="py-3 px-3 text-emerald-700">Low complexity, simple DOM API, minimal setup.</td>
                <td className="py-3 px-3">Higher complexity (WebGL shaders, style JSON schemas, layer ordering).</td>
                <td className="py-3 px-3 font-semibold text-emerald-800">Leaflet</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Hosting &amp; Tiles</td>
                <td className="py-3 px-3 text-emerald-700">Simple PNG/JPG raster tiles, virtually zero server compute.</td>
                <td className="py-3 px-3">Requires vector tile endpoint (PBF/MVT) and font glyphs/sprites endpoints.</td>
                <td className="py-3 px-3 font-semibold text-emerald-800">Leaflet</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold">Cost / Licensing</td>
                <td className="py-3 px-3 text-emerald-700">100% Free BSD-2 license, works with free OSM tiles.</td>
                <td className="py-3 px-3">MapLibre is free (BSD-3), but high-res vector tiles often require API keys/tokens.</td>
                <td className="py-3 px-3 font-semibold text-slate-800">Tie / Context-dependent</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3D Capability Observations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Observed 3D Advantages
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>Perspective camera gives riders a realistic forward-looking sense of where the bus is heading.</li>
              <li>3D building outlines provide visual landmarks (e.g. library, sports stadium, main academic building).</li>
              <li>Smooth vector zooming does not produce blurry pixelated raster tiles during zoom transitions.</li>
              <li>Dynamic camera pitch/bearing presets provide specialized views (e.g., driver chase mode vs. campus bird&apos;s eye).</li>
            </ul>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Observed 3D Tradeoffs &amp; Limitations
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>At steep angles (&gt; 65&deg;), tall 3D buildings can occlude the bus marker or stops behind them.</li>
              <li>Vector tile hosting requires glyphs and sprites servers, adding deployment operational overhead.</li>
              <li>WebGL engine increases JavaScript bundle size by ~200KB and consumes more battery on mobile.</li>
              <li>OpenStreetMap building height data in campus areas is often incomplete, leading to generic estimated heights.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
