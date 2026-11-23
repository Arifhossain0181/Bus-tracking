'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

if (typeof window !== 'undefined') {
  try {
    setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
  } catch {
    // ignore
  }
}

import {
  Crosshair,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  Minus,
  Navigation2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  X,
  Bus as BusIcon,
  Sun,
  Moon,
  Sunset,
  Navigation,
} from 'lucide-react';
import { ThreeMap3DLayer, type ActiveBusData } from '@/lib/map3d/threeMapLayer';
import {
  PILOT_MAP_STYLE_URL,
  IUBAT_CAMPUS_CENTER,
  DEFAULT_CAMERA_PITCH,
  ISOMETRIC_CAMERA_PITCH,
  SATELLITE_IMAGERY_ENABLED,
} from '@/lib/mapConfig';

export type Map3DStylePreset = 'satellite' | 'mapbox-satellite' | 'voyager' | 'architectural' | 'dark';
export type LightingPreset = 'day' | 'dusk' | 'night';

const BASE_VECTOR_STYLE = PILOT_MAP_STYLE_URL;
const SATELLITE_RASTER_URL = SATELLITE_IMAGERY_ENABLED
  ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  : '';

const STYLE_URLS: Record<Map3DStylePreset, string> = {
  satellite: BASE_VECTOR_STYLE,
  'mapbox-satellite': 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  architectural: BASE_VECTOR_STYLE,
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const DEFAULT_CENTER: [number, number] = IUBAT_CAMPUS_CENTER; // [lng, lat] for MapLibre

export interface StopPoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  order?: number;
  scheduledTime?: string;
  isMajor?: boolean;
}

export interface Map3DViewProps {
  buses?: ActiveBusData[];
  routePath?: [number, number][]; // [longitude, latitude][]
  stops?: StopPoint[];
  focusedBusId?: number | null;
  followingBusId?: number | null;
  userPosition?: [number, number] | null; // [latitude, longitude]
  heightClass?: string;
  onSelectBus?: (busId: number) => void;
  onRefresh?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  showOverlayCards?: boolean;
}

const DEFAULT_UPCOMING_STOPS: StopPoint[] = [
  { id: 1, name: 'Main Gate', latitude: 23.8103, longitude: 90.4125, isMajor: true },
  { id: 2, name: 'Science Building', latitude: 23.8120, longitude: 90.4140 },
  { id: 3, name: 'Library', latitude: 23.8135, longitude: 90.4155, isMajor: true },
  { id: 4, name: 'Campus Building', latitude: 23.8150, longitude: 90.4170 },
  { id: 5, name: 'University', latitude: 23.8165, longitude: 90.4185 },
  { id: 6, name: 'Homer Building', latitude: 23.8180, longitude: 90.4200 },
  { id: 7, name: 'Exotuator', latitude: 23.8195, longitude: 90.4215 },
];

export default function Map3DView({
  buses = [],
  routePath,
  stops = [],
  focusedBusId = null,
  followingBusId = null,
  userPosition = null,
  heightClass = 'h-[680px]',
  onSelectBus,
  onRefresh,
  onMapClick,
  showOverlayCards = true,
}: Map3DViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const threeLayerRef = useRef<ThreeMap3DLayer | null>(null);

  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [stylePreset, setStylePreset] = useState<Map3DStylePreset>('satellite');
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('day');
  const [showStyleMenu, setShowStyleMenu] = useState<boolean>(false);
  const [showFilterMenu, setShowFilterMenu] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBusState, setSelectedBusState] = useState<ActiveBusData | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(!!followingBusId);

  // Screen coordinates for floating 3D Bus Tag billboard
  const [busScreenPos, setBusScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Sync selected bus state
  useEffect(() => {
    if (focusedBusId != null) {
      const match = buses.find((b) => b.id === focusedBusId);
      if (match) setSelectedBusState(match);
    } else if (!selectedBusState && buses.length > 0) {
      setSelectedBusState(buses[0]);
    }
  }, [focusedBusId, buses, selectedBusState]);

  // Keep floating 3D bus tag updated in screen space
  const updateBusScreenPosition = useCallback(() => {
    const map = mapRef.current;
    const targetBus = selectedBusState || (buses.length > 0 ? buses[0] : null);
    if (!map || !targetBus) {
      setBusScreenPos(null);
      return;
    }
    try {
      const pos = map.project([targetBus.longitude, targetBus.latitude]);
      setBusScreenPos({ x: pos.x, y: pos.y });
    } catch {
      setBusScreenPos(null);
    }
  }, [selectedBusState, buses]);

  // Setup Real High-Resolution Satellite Raster Imagery
  const setupSatelliteLayer = useCallback((map: MapLibreMap) => {
    try {
      if (!map.getSource('satellite-source')) {
        map.addSource('satellite-source', {
          type: 'raster',
          tiles: [SATELLITE_RASTER_URL],
          tileSize: 256,
          maxzoom: 19,
        });

        // Insert underneath vector features and buildings
        const firstLayerId = map.getStyle()?.layers?.[0]?.id;
        map.addLayer(
          {
            id: 'satellite-imagery-layer',
            type: 'raster',
            source: 'satellite-source',
            paint: {
              'raster-opacity': 1.0,
              'raster-contrast': 0.12,
              'raster-saturation': 0.18,
            },
          },
          firstLayerId
        );
      }
    } catch {
      // Ignore if raster layer already added
    }
  }, []);

  // Setup 3D building extrusions on map style load
  const setup3DBuildings = useCallback((map: MapLibreMap) => {
    try {
      const style = map.getStyle();
      if (!style || !style.layers) return;

      let labelLayerId: string | undefined;
      for (let i = 0; i < style.layers.length; i++) {
        const layer = style.layers[i];
        if (layer.type === 'symbol' && (layer.layout as Record<string, unknown> | undefined)?.['text-field']) {
          labelLayerId = layer.id;
          break;
        }
      }

      const sourceId = map.getSource('protomaps')
        ? 'protomaps'
        : map.getSource('openmaptiles')
        ? 'openmaptiles'
        : map.getSource('carto')
        ? 'carto'
        : null;

      if (sourceId && !map.getLayer('3d-buildings-extrusion')) {
        map.addLayer(
          {
            id: '3d-buildings-extrusion',
            source: sourceId,
            'source-layer': 'buildings',
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                '#d5bdaf',
                15,
                '#e3d5ca',
                17,
                '#f5ebe0',
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                0,
                14,
                16,
                16,
                38,
                18,
                65,
              ],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.92,
              'fill-extrusion-vertical-gradient': true,
            },
          },
          labelLayerId
        );
      }
    } catch {
      // Ignore
    }
  }, []);

  // Setup dual-stripe glowing neon route polyline (matching the screenshot!)
  const setupRouteLayers = useCallback((map: MapLibreMap, coords: [number, number][]) => {
    const geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        },
      ],
    };

    const source = map.getSource('route-line-source') as GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
      return;
    }

    map.addSource('route-line-source', {
      type: 'geojson',
      data: geojson,
    });

    // 1. Wide soft ambient neon road glow
    map.addLayer({
      id: 'route-glow-outer',
      type: 'line',
      source: 'route-line-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#00d2ff',
        'line-width': 18,
        'line-opacity': 0.35,
        'line-blur': 8,
      },
    });

    // 2. Dual-stripe neon lane markings: Left neon beam
    map.addLayer({
      id: 'route-lane-left',
      type: 'line',
      source: 'route-line-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#38bdf8',
        'line-width': 3.5,
        'line-offset': -3.5,
        'line-opacity': 0.95,
      },
    });

    // 3. Dual-stripe neon lane markings: Right neon beam
    map.addLayer({
      id: 'route-lane-right',
      type: 'line',
      source: 'route-line-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#38bdf8',
        'line-width': 3.5,
        'line-offset': 3.5,
        'line-opacity': 0.95,
      },
    });

    // 4. White laser core beam
    map.addLayer({
      id: 'route-core-glow',
      type: 'line',
      source: 'route-line-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 2,
        'line-opacity': 0.98,
      },
    });
  }, []);

  // Setup 3D stop pins
  const setupStopsLayers = useCallback((map: MapLibreMap, stopList: StopPoint[]) => {
    if (stopList.length === 0) return;
    const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: stopList.map((s) => ({
        type: 'Feature',
        properties: {
          id: s.id,
          name: s.name,
          order: s.order || 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [s.longitude, s.latitude],
        },
      })),
    };

    const source = map.getSource('stops-source') as GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
      return;
    }

    map.addSource('stops-source', {
      type: 'geojson',
      data: geojson,
    });

    map.addLayer({
      id: 'stops-glow',
      type: 'circle',
      source: 'stops-source',
      paint: {
        'circle-radius': 10,
        'circle-color': '#0ea5e9',
        'circle-opacity': 0.5,
        'circle-blur': 0.5,
      },
    });

    map.addLayer({
      id: 'stops-core',
      type: 'circle',
      source: 'stops-source',
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#0284c7',
      },
    });
  }, []);

  // Initialize MapLibre Map and 3D Three.js Layer
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (typeof window !== 'undefined') {
      try {
        setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
      } catch {
        // ignore
      }
    }

    const initialCenter =
      buses.length > 0
        ? ([buses[0].longitude, buses[0].latitude] as [number, number])
        : routePath && routePath.length > 0
        ? routePath[0]
        : DEFAULT_CENTER;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URLS[stylePreset],
      center: initialCenter,
      zoom: 16.2,
      pitch: DEFAULT_CAMERA_PITCH, // Flat 2D view by default
      bearing: 0,
      maxPitch: 82,
    });

    const threeLayer = new ThreeMap3DLayer('3d-bus-layer');
    threeLayerRef.current = threeLayer;

    map.on('style.load', () => {
      // Add Real High-Res Satellite layer (only if enabled and satellite preset selected)
      if (SATELLITE_IMAGERY_ENABLED && stylePreset === 'mapbox-satellite') {
        setupSatelliteLayer(map);
      }

      // Add 3D architectural building extrusions (only if 3D mode enabled by user)
      if (is3DMode) {
        setup3DBuildings(map);
      }

      // Add Three.js 3D buses layer (only if 3D mode enabled by user)
      if (is3DMode && !map.getLayer(threeLayer.id)) {
        map.addLayer(threeLayer);
      }

      // Add route polyline if present
      if (routePath && routePath.length > 0) {
        setupRouteLayers(map, routePath);
      } else {
        // Sample route path if none provided to render neon highway
        const sampleCoords: [number, number][] = [
          [90.4100, 23.8085],
          [90.4125, 23.8103],
          [90.4150, 23.8125],
          [90.4180, 23.8150],
        ];
        setupRouteLayers(map, sampleCoords);
      }

      // Add stops
      const activeStops = stops.length > 0 ? stops : DEFAULT_UPCOMING_STOPS;
      setupStopsLayers(map, activeStops);
    });

    map.on('render', () => {
      updateBusScreenPosition();
    });

    map.on('move', () => {
      updateBusScreenPosition();
    });

    map.on('click', (e) => {
      onMapClick?.(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      threeLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update buses in Three.js layer
  useEffect(() => {
    const layer = threeLayerRef.current;
    if (layer) {
      layer.updateBuses(buses);
    }
    updateBusScreenPosition();
  }, [buses, updateBusScreenPosition]);

  // Update dynamic lighting preset
  useEffect(() => {
    threeLayerRef.current?.setLighting(lightingPreset);
  }, [lightingPreset]);

  // Update route path
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded() && routePath && routePath.length > 0) {
      setupRouteLayers(map, routePath);
    }
  }, [routePath, setupRouteLayers]);

  // Update stops
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded() && stops.length > 0) {
      setupStopsLayers(map, stops);
    }
  }, [stops, setupStopsLayers]);

  // Handle follow mode toggle
  useEffect(() => {
    const layer = threeLayerRef.current;
    if (layer) {
      const targetId = isFollowing ? selectedBusState?.id || followingBusId : null;
      layer.setFollowingBusId(targetId ?? null);
    }
  }, [isFollowing, selectedBusState, followingBusId]);

  // 3D / 2D camera toggle handler
  const handleToggle3D = () => {
    const map = mapRef.current;
    if (!map) return;

    if (is3DMode) {
      if (map.getLayer('3d-buildings-extrusion')) {
        map.setLayoutProperty('3d-buildings-extrusion', 'visibility', 'none');
      }
      if (threeLayerRef.current && map.getLayer(threeLayerRef.current.id)) {
        map.removeLayer(threeLayerRef.current.id);
      }
      map.easeTo({
        pitch: DEFAULT_CAMERA_PITCH,
        bearing: 0,
        duration: 1000,
      });
      setIs3DMode(false);
    } else {
      setup3DBuildings(map);
      if (map.getLayer('3d-buildings-extrusion')) {
        map.setLayoutProperty('3d-buildings-extrusion', 'visibility', 'visible');
      }
      if (threeLayerRef.current && !map.getLayer(threeLayerRef.current.id)) {
        map.addLayer(threeLayerRef.current);
      }
      map.easeTo({
        pitch: ISOMETRIC_CAMERA_PITCH,
        bearing: -18,
        zoom: 16.2,
        duration: 1200,
      });
      setIs3DMode(true);
    }
  };

  // Recenter on bus
  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedBusState) {
      map.flyTo({
        center: [selectedBusState.longitude, selectedBusState.latitude],
        zoom: 16.8,
        pitch: is3DMode ? 58 : 0,
        bearing: is3DMode ? selectedBusState.heading || -18 : 0,
        duration: 1400,
      });
    } else if (userPosition) {
      map.flyTo({
        center: [userPosition[1], userPosition[0]],
        zoom: 16,
        pitch: is3DMode ? 58 : 0,
        duration: 1200,
      });
    } else if (buses.length > 0) {
      map.flyTo({
        center: [buses[0].longitude, buses[0].latitude],
        zoom: 16,
        pitch: is3DMode ? 58 : 0,
        duration: 1200,
      });
    }
  };

  const handleResetBearing = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: 0, duration: 800 });
  };

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 300 });

  const handleSwitchStyle = (preset: Map3DStylePreset) => {
    setStylePreset(preset);
    setShowStyleMenu(false);
    const map = mapRef.current;
    if (map) {
      map.setStyle(STYLE_URLS[preset]);
    }
  };

  const currentStops = stops.length > 0 ? stops : DEFAULT_UPCOMING_STOPS;
  const currentBus = selectedBusState || (buses.length > 0 ? buses[0] : null);

  const speedKmh = currentBus?.speed != null ? Math.round(currentBus.speed * 3.6) : 24;
  const busLabel = currentBus?.busNumber || 'Bus 12';
  const routeLabel = currentBus?.routeName || 'Campus Express';

  return (
    <div className={`relative w-full overflow-hidden rounded-3xl shadow-2xl border border-slate-700/50 bg-slate-950 ${heightClass}`}>
      {/* Map WebGL Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* 1. FLOATING 3D BUS BILLBOARD TAG (Directly above the 3D bus in screen space) */}
      {busScreenPos && (
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full z-20 transition-all duration-75"
          style={{ left: busScreenPos.x, top: busScreenPos.y - 42 }}
        >
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white text-slate-900 rounded-full shadow-2xl border border-slate-200/90 font-bold text-xs tracking-tight">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <BusIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Live &bull; ETA 4 mins</span>
          </div>
          {/* Downward triangle pointer to bus roof */}
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-[6px] border-l-transparent border-r-transparent border-t-white mx-auto shadow-sm" />
        </div>
      )}

      {/* 2. LEFT FROSTED GLASS NAVIGATION PANEL (Exact match to screenshot!) */}
      {showOverlayCards && (
        <aside className="absolute top-4 left-4 bottom-4 z-20 w-80 bg-slate-950/75 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 text-white flex flex-col justify-between shadow-2xl">
          <div className="space-y-4">
            {/* Header: Bus Icon + App Title */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-cyan-400 shadow-sm">
                <BusIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm tracking-tight text-white leading-tight">
                  University Bus<br />Management System
                </h2>
              </div>
            </div>

            {/* Active Bus & Route Info Card */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Active:</span>
                <span className="font-bold text-white">{busLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Route:</span>
                <span className="font-semibold text-cyan-300">{routeLabel}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-slate-400">Est. Arrival:</span>
                <span className="font-bold text-emerald-400">4 mins</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !isFollowing;
                  setIsFollowing(next);
                  if (currentBus) onSelectBus?.(currentBus.id);
                }}
                className={`w-full py-1.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition ${
                  isFollowing
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                    : 'bg-white/10 text-slate-300 hover:bg-white/15'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{isFollowing ? 'Tracking Locked (3D)' : 'Lock 3D Camera'}</span>
              </button>
            </div>

            {/* Upcoming Stops Timeline */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Upcoming stops
              </h3>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {currentStops.map((stop, idx) => {
                  const isCurrent = idx === 0;
                  const isDestination = idx === currentStops.length - 1;
                  return (
                    <div
                      key={stop.id || idx}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                        isCurrent
                          ? 'bg-blue-600/30 text-white font-semibold border border-blue-500/40 shadow-sm'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isCurrent
                              ? 'bg-cyan-400 ring-4 ring-cyan-500/20 animate-pulse'
                              : isDestination
                              ? 'bg-rose-500'
                              : 'bg-slate-500'
                          }`}
                        />
                        <span className="truncate max-w-[140px]">{stop.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        {isCurrent && <MapPin className="w-3.5 h-3.5 text-emerald-400" />}
                        {!isCurrent && !isDestination && <Info className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Help & Settings Icons */}
          <div className="flex items-center justify-between pt-3 border-t border-white/10 text-slate-400">
            <div className="flex items-center gap-1">
              <button type="button" className="p-2 hover:bg-white/10 rounded-xl hover:text-white transition">
                <HelpCircle className="w-4 h-4" />
              </button>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  title="Refresh GPS"
                  className="p-2 hover:bg-white/10 rounded-xl hover:text-white transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowStyleMenu(!showStyleMenu)}
              className="p-2 hover:bg-white/10 rounded-xl hover:text-white transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* 3. TOP FLOATING SEARCH BAR (Exact match to screenshot!) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-md">
        <div className="flex items-center gap-2.5 bg-slate-900/80 backdrop-blur-xl text-white px-4 py-2.5 rounded-2xl border border-white/15 shadow-2xl">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stops or routes..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="h-4 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            title="Filters and Lighting"
            className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filter / Lighting Dropdown */}
        {showFilterMenu && (
          <div className="mt-1.5 bg-slate-900/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl p-3 text-xs text-white">
            <div className="font-semibold text-slate-400 mb-2">Lighting & Sun Angle</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLightingPreset('day')}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                  lightingPreset === 'day' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Day</span>
              </button>
              <button
                type="button"
                onClick={() => setLightingPreset('dusk')}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                  lightingPreset === 'dusk' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <Sunset className="w-4 h-4 text-orange-400" />
                <span>Dusk</span>
              </button>
              <button
                type="button"
                onClick={() => setLightingPreset('night')}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                  lightingPreset === 'night' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <Moon className="w-4 h-4 text-blue-400" />
                <span>Night</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. BOTTOM-CENTER FLOATING HUD (Exact match to screenshot!) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-slate-950/80 backdrop-blur-2xl border border-white/15 text-white shadow-2xl text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">Live Tracking ({currentBus?.driverName?.split(' ')[0] || 'arif'})</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              LIVE
            </span>
          </div>
          <div className="h-3.5 w-px bg-white/20" />
          <div className="flex items-center gap-3 text-slate-300">
            <span>Speed: <strong className="text-white">{speedKmh} km/h</strong></span>
            <span>Occupancy: <strong className="text-white">35%</strong></span>
          </div>
        </div>
      </div>

      {/* 5. RIGHT-SIDE TOOLBAR CONTROLS (Exact match to screenshot!) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2.5">
        {/* Layer Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            title="Layer Settings"
            className="w-10 h-10 rounded-2xl bg-slate-950/80 backdrop-blur-xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-white transition"
          >
            <Layers className="w-5 h-5" />
          </button>

          {showStyleMenu && (
            <div className="absolute right-0 top-12 w-56 bg-slate-950/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl py-2 text-xs text-white z-50">
              <div className="px-3 py-1 font-semibold text-slate-400 border-b border-white/10 mb-1">
                Visual Engines
              </div>
              <button
                type="button"
                onClick={() => handleSwitchStyle('satellite')}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between ${
                  stylePreset === 'satellite' ? 'text-cyan-400 font-bold' : ''
                }`}
              >
                <span>Realistic Satellite 3D</span>
                {stylePreset === 'satellite' && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchStyle('mapbox-satellite')}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between ${
                  stylePreset === 'mapbox-satellite' ? 'text-cyan-400 font-bold' : ''
                }`}
              >
                <span>Mapbox Standard Satellite</span>
                {stylePreset === 'mapbox-satellite' && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchStyle('voyager')}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between ${
                  stylePreset === 'voyager' ? 'text-cyan-400 font-bold' : ''
                }`}
              >
                <span>Voyager 3D (Green/Blue)</span>
                {stylePreset === 'voyager' && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchStyle('dark')}
                className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between ${
                  stylePreset === 'dark' ? 'text-cyan-400 font-bold' : ''
                }`}
              >
                <span>Dark Neon 3D</span>
                {stylePreset === 'dark' && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
              </button>
            </div>
          )}
        </div>

        {/* Zoom In & Out Pill */}
        <div className="flex flex-col rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            className="w-10 h-10 text-slate-200 flex items-center justify-center hover:bg-white/20 hover:text-white transition"
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className="h-px w-full bg-white/10" />
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="w-10 h-10 text-slate-200 flex items-center justify-center hover:bg-white/20 hover:text-white transition"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>

        {/* 3D / 2D Toggle Button Pill */}
        <button
          type="button"
          onClick={handleToggle3D}
          title={is3DMode ? 'Switch to 2D Top-Down' : 'Switch to 3D Isometric'}
          className={`w-10 h-10 rounded-2xl backdrop-blur-xl border border-white/15 shadow-2xl flex items-center justify-center font-extrabold text-xs transition ${
            is3DMode
              ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/30'
              : 'bg-slate-950/80 text-slate-300 hover:bg-white/20'
          }`}
        >
          3D
        </button>

        {/* Recenter / Target icon */}
        <button
          type="button"
          onClick={handleRecenter}
          title="Target Bus / Recenter"
          className="w-10 h-10 rounded-2xl bg-slate-950/80 backdrop-blur-xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-white transition"
        >
          <Crosshair className="w-5 h-5 text-cyan-400" />
        </button>

        {/* Compass / Reset Bearing */}
        <button
          type="button"
          onClick={handleResetBearing}
          title="Reset Heading (North)"
          className="w-10 h-10 rounded-2xl bg-slate-950/80 backdrop-blur-xl text-slate-200 border border-white/15 shadow-2xl flex items-center justify-center hover:bg-white/20 hover:text-white transition"
        >
          <Navigation2 className="w-5 h-5 text-slate-300" />
        </button>
      </div>

      {/* 6. BOTTOM-RIGHT SATELLITE ENGINE WATERMARK */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-slate-400 shadow-xl">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>High-Resolution Satellite 3D Engine</span>
        </div>
      </div>
    </div>
  );
}
