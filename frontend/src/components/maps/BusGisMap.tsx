'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

if (typeof window !== 'undefined') {
  try {
    setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
  } catch {
    // fallback
  }
}

import { ThreeMap3DLayer, type ActiveBusData } from '@/lib/map3d/threeMapLayer';
import {
  fetchRoadRouteGeometry,
  getBusRoadHeading,
  getCurrentLocationName,
  getNextUpcomingStop,
  snapBusToRoad,
  splitRouteByBusPosition,
  type StopInfo,
} from '@/lib/map3d/routeGeometry';
import FloatingBusHUD from './FloatingBusHUD';
import BusMarkerPopup, { type BusPopupData } from './BusMarkerPopup';
import MapInterfaceControls, { type MapLayerPreset } from './MapInterfaceControls';

/**
 * 1. Google Photorealistic HD Satellite / Hybrid Style Specification
 * Sub-meter resolution aerial imagery across Bangladesh (Dhaka, Gazipur, Tongi, Kuril, etc.)
 * with high-contrast road network and neighborhood place labels.
 */
export const GOOGLE_HYBRID_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'google-satellite-tiles': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 22,
      attribution: 'Google Satellite Imagery',
    },
  },
  layers: [
    {
      id: 'google-satellite-raster',
      type: 'raster',
      source: 'google-satellite-tiles',
      paint: {
        'raster-opacity': 1.0,
        'raster-contrast': 0.1,
        'raster-saturation': 0.14,
        'raster-resampling': 'linear',
      },
    },
  ],
};

/**
 * 2. Esri High-Resolution World Imagery 3D (Bus GIS Satellite Style)
 * Authentic photographic satellite basemap with road geometry and boundaries.
 */
export const ESRI_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite-tiles': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri World Imagery, Maxar, Earthstar Geographics',
    },
    'esri-roads-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    'esri-labels-tiles': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite-tiles',
      paint: {
        'raster-opacity': 1.0,
        'raster-contrast': 0.08,
        'raster-saturation': 0.12,
        'raster-resampling': 'linear',
      },
    },
    {
      id: 'esri-roads-layer',
      type: 'raster',
      source: 'esri-roads-tiles',
      paint: {
        'raster-opacity': 0.75,
      },
    },
    {
      id: 'esri-labels-layer',
      type: 'raster',
      source: 'esri-labels-tiles',
      paint: {
        'raster-opacity': 0.9,
      },
    },
  ],
};

const BASE_STYLES: Record<MapLayerPreset, string | StyleSpecification> = {
  satellite: GOOGLE_HYBRID_STYLE,
  'mapbox-satellite': ESRI_SATELLITE_STYLE,
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

// IUBAT Permanent Campus: 4 Embankment Drive Road, Sector 10, Uttara Model Town, Dhaka 1230
const DEFAULT_CENTER: [number, number] = [90.3896, 23.8878];

export interface BusGisMapProps {
  buses?: ActiveBusData[];
  routePath?: [number, number][]; // [longitude, latitude][]
  stops?: StopInfo[];
  routeName?: string;
  originName?: string;
  destinationName?: string;
  focusedBusId?: number | null;
  followingBusId?: number | null;
  userPosition?: [number, number] | null; // [latitude, longitude]
  heightClass?: string;
  onSelectBus?: (busId: number) => void;
  onRefresh?: () => void;
  showHUD?: boolean;
}

export default function BusGisMap({
  buses = [],
  routePath,
  stops = [],
  routeName = 'IUBAT - Campus Express',
  originName = 'IUBAT Permanent Campus',
  destinationName = 'Kuril Interchange',
  focusedBusId = null,
  followingBusId = null,
  userPosition = null,
  heightClass = 'h-[750px]',
  onSelectBus,
  showHUD = true,
}: BusGisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const threeLayerRef = useRef<ThreeMap3DLayer | null>(null);
  const busMarkersRef = useRef<Map<number, Marker>>(new Map());

  const [is3DMode, setIs3DMode] = useState(true);
  const [activeLayer, setActiveLayer] = useState<MapLayerPreset>('satellite');
  const [selectedBusId, setSelectedBusId] = useState<number | null>(focusedBusId);
  const [isFollowing, setIsFollowing] = useState<boolean>(true); // Auto-follow enabled by default!
  const [popupBusData, setPopupBusData] = useState<BusPopupData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [roadGeometry, setRoadGeometry] = useState<[number, number][] | null>(null);

  // Fetch true Bangladesh road geometry (OSRM driving route) connecting the stops
  // Ensures the route polyline strictly follows actual streets without crossing buildings
  useEffect(() => {
    let isMounted = true;
    if (stops.length >= 2) {
      fetchRoadRouteGeometry(stops).then((coords) => {
        if (isMounted && coords.length >= 2) {
          setRoadGeometry(coords);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [stops]);

  // Open bus popup
  const handleBusClick = useCallback(
    (bus: ActiveBusData) => {
      setSelectedBusId(bus.id);
      onSelectBus?.(bus.id);
      setPopupBusData({
        id: bus.id,
        busNumber: bus.busNumber,
        driverName: bus.driverName,
        speedKmh: bus.speed ? Math.round(bus.speed * 3.6) : 0,
        latitude: bus.latitude,
        longitude: bus.longitude,
        routeName: bus.routeName,
        status: bus.speed && bus.speed > 1 ? 'moving' : 'stopped',
        lastUpdated: bus.lastUpdated ? new Date(bus.lastUpdated).toLocaleTimeString() : 'Just now',
      });
    },
    [onSelectBus]
  );

  // Sync selected bus from props or default to first bus
  useEffect(() => {
    if (focusedBusId != null) {
      setSelectedBusId(focusedBusId);
    } else if (selectedBusId == null && buses.length > 0) {
      setSelectedBusId(buses[0].id);
    }
  }, [focusedBusId, buses, selectedBusId]);

  // Selected bus object
  const selectedBus = useMemo(() => {
    return buses.find((b) => b.id === selectedBusId) || (buses.length > 0 ? buses[0] : null);
  }, [buses, selectedBusId]);

  // Active road path (prefers real BD road geometry from OSRM connecting IUBAT stops)
  const activeRoadPath = useMemo(() => {
    if (roadGeometry && roadGeometry.length >= 2) return roadGeometry;
    if (routePath && routePath.length >= 2) return routePath;
    if (stops && stops.length >= 2) return stops.map((s) => [s.longitude, s.latitude] as [number, number]);
    return [
      [90.3896, 23.8878], // IUBAT Permanent Campus
      [90.3910, 23.8845], // Sector 10 Embankment Road
      [90.3925, 23.8820], // Abdullahpur Station
      [90.3950, 23.8750], // Uttara House Building
      [90.3990, 23.8680], // Uttara Sector 3
      [90.4075, 23.8515], // Airport Station
      [90.4180, 23.8340], // Khilkhet Transit
      [90.4215, 23.8250], // Kuril Interchange
    ] as [number, number][];
  }, [roadGeometry, routePath, stops]);

  // Calculate route split (completed vs remaining), progress, current location, road heading, and next stop
  const routeMetrics = useMemo(() => {
    if (!selectedBus) {
      return {
        completed: activeRoadPath,
        remaining: [],
        progressPercent: 65,
        currentLocationName: stops[0]?.name || 'IUBAT Permanent Campus',
        nextStopName: stops[1]?.name || 'Abdullahpur Station',
        distanceToNextKm: 0.8,
        etaMinutes: 3,
        snappedBusCoords: [90.3896, 23.8878] as [number, number],
        roadHeading: 165,
      };
    }

    // Snap bus GPS coordinates to the nearest road point so the vehicle sits directly on the road
    const snappedBusCoords = snapBusToRoad(
      selectedBus.longitude,
      selectedBus.latitude,
      activeRoadPath
    );

    const roadHeading = getBusRoadHeading(
      snappedBusCoords[0],
      snappedBusCoords[1],
      activeRoadPath,
      selectedBus.heading || 165
    );

    const { completed, remaining, progressPercent } = splitRouteByBusPosition(
      snappedBusCoords[0],
      snappedBusCoords[1],
      activeRoadPath
    );

    const { nextStop, distanceKm, estimatedMinutes } = getNextUpcomingStop(
      snappedBusCoords[0],
      snappedBusCoords[1],
      stops
    );

    const currentLocationName = getCurrentLocationName(
      snappedBusCoords[0],
      snappedBusCoords[1],
      stops
    );

    return {
      completed,
      remaining,
      progressPercent,
      currentLocationName: currentLocationName || stops[0]?.name || 'IUBAT Permanent Campus',
      nextStopName: nextStop?.name || stops[0]?.name || 'Abdullahpur Station',
      distanceToNextKm: distanceKm,
      etaMinutes: estimatedMinutes,
      snappedBusCoords,
      roadHeading,
    };
  }, [selectedBus, activeRoadPath, stops]);

  // Maintain synchronized refs for MapLibre style lifecycle events
  const routeMetricsRef = useRef(routeMetrics);
  routeMetricsRef.current = routeMetrics;

  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  const activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;

  // 3D Architectural Extrusions (only applied on vector styles like Voyager or Dark)
  const setup3DBuildings = useCallback((map: MapLibreMap) => {
    // Keep satellite imagery completely unblocked so realistic roofs and roads are 100% visible
    if (activeLayerRef.current === 'satellite' || activeLayerRef.current === 'mapbox-satellite') return;

    try {
      const style = map.getStyle();
      if (!style || !style.layers) return;

      const sourceId = map.getSource('protomaps')
        ? 'protomaps'
        : map.getSource('openmaptiles')
        ? 'openmaptiles'
        : map.getSource('carto')
        ? 'carto'
        : null;

      if (sourceId && !map.getLayer('3d-buildings-extrusion')) {
        map.addLayer({
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
              18,
              16,
              42,
              18,
              70,
            ],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.9,
            'fill-extrusion-vertical-gradient': true,
          },
        });
      }
    } catch {
      // Ignore
    }
  }, []);

  // Route Splitting (Completed section in vibrant green/cyan, remaining in electric blue)
  const setupRouteLayers = useCallback(
    (map: MapLibreMap, completedCoords: [number, number][], remainingCoords: [number, number][]) => {
      // 1. Completed Route GeoJSON
      const completedGeoJSON: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: completedCoords,
            },
          },
        ],
      };

      // 2. Remaining Route GeoJSON
      const remainingGeoJSON: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: remainingCoords.length > 0 ? remainingCoords : completedCoords,
            },
          },
        ],
      };

      const completedSource = map.getSource('completed-route-source') as GeoJSONSource | undefined;
      const remainingSource = map.getSource('remaining-route-source') as GeoJSONSource | undefined;

      if (completedSource && remainingSource) {
        completedSource.setData(completedGeoJSON);
        remainingSource.setData(remainingGeoJSON);
        return;
      }

      // Add sources
      if (!map.getSource('completed-route-source')) {
        map.addSource('completed-route-source', {
          type: 'geojson',
          data: completedGeoJSON,
        });
      }

      if (!map.getSource('remaining-route-source')) {
        map.addSource('remaining-route-source', {
          type: 'geojson',
          data: remainingGeoJSON,
        });
      }

      // Remaining Route: Soft electric blue guide path
      if (!map.getLayer('remaining-route-glow')) {
        map.addLayer({
          id: 'remaining-route-glow',
          type: 'line',
          source: 'remaining-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#0284c7',
            'line-width': 8,
            'line-opacity': 0.5,
            'line-dasharray': [2, 2],
          },
        });
      }

      // Completed Route: Vibrant neon green/cyan highway
      if (!map.getLayer('completed-route-outer-glow')) {
        map.addLayer({
          id: 'completed-route-outer-glow',
          type: 'line',
          source: 'completed-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#10b981',
            'line-width': 16,
            'line-opacity': 0.35,
            'line-blur': 6,
          },
        });
      }

      // Completed Route Core: Electric cyan beam
      if (!map.getLayer('completed-route-core')) {
        map.addLayer({
          id: 'completed-route-core',
          type: 'line',
          source: 'completed-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#00e5ff',
            'line-width': 4.5,
            'line-opacity': 0.98,
          },
        });
      }
    },
    []
  );

  // Station/Stop Markers with sequence numbering
  const setupStopMarkers = useCallback((map: MapLibreMap, stopList: StopInfo[]) => {
    if (stopList.length === 0) return;

    const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: stopList.map((s, idx) => ({
        type: 'Feature',
        properties: {
          id: s.id,
          name: s.name,
          order: s.order || idx + 1,
          isMajor: s.isMajor || false,
        },
        geometry: {
          type: 'Point',
          coordinates: [s.longitude, s.latitude],
        },
      })),
    };

    const source = map.getSource('stops-layer-source') as GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
      return;
    }

    map.addSource('stops-layer-source', {
      type: 'geojson',
      data: geojson,
    });

    // Outer glow
    map.addLayer({
      id: 'stops-halo',
      type: 'circle',
      source: 'stops-layer-source',
      paint: {
        'circle-radius': 11,
        'circle-color': '#00e5ff',
        'circle-opacity': 0.4,
        'circle-blur': 0.6,
      },
    });

    // Station Circle
    map.addLayer({
      id: 'stops-symbol-circle',
      type: 'circle',
      source: 'stops-layer-source',
      paint: {
        'circle-radius': 6.5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#0284c7',
      },
    });

    // Station Click Popup
    map.on('click', 'stops-symbol-circle', (e) => {
      const feat = e.features?.[0];
      if (feat && feat.properties) {
        const { name, order, isMajor } = feat.properties;
        new Popup({ offset: 12, closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="background:#090d16;color:white;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 12px 28px rgba(0,0,0,0.6);font-family:sans-serif;font-size:12px;min-width:150px;">
              <div style="color:#00e5ff;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">
                Station #${order} ${isMajor ? '&bull; Major Station' : ''}
              </div>
              <div style="font-weight:700;font-size:13px;margin-top:3px;color:#f8fafc;">${name}</div>
            </div>`
          )
          .addTo(map);
      }
    });

    map.on('mouseenter', 'stops-symbol-circle', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'stops-symbol-circle', () => {
      map.getCanvas().style.cursor = '';
    });
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = selectedBus
      ? ([selectedBus.longitude, selectedBus.latitude] as [number, number])
      : DEFAULT_CENTER;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLES[activeLayer],
      center: initialCenter,
      zoom: 17.0,
      pitch: 58,
      bearing: -18,
      maxPitch: 82,
      maxZoom: 22,
      minZoom: 3,
      fadeDuration: 0,
    });

    const threeLayer = new ThreeMap3DLayer('3d-bus-gis-vehicles');
    threeLayerRef.current = threeLayer;

    map.on('style.load', () => {
      // 1. Add 3D Extrusions (only for vector basemaps like Voyager or Dark)
      setup3DBuildings(map);

      // 2. Add Three.js Bus Model Layer
      if (threeLayerRef.current && !map.getLayer(threeLayerRef.current.id)) {
        map.addLayer(threeLayerRef.current);
      }

      // 3. Add Route Splitting (Completed vs Remaining)
      setupRouteLayers(
        map,
        routeMetricsRef.current.completed,
        routeMetricsRef.current.remaining
      );

      // 4. Add Stop Stations
      setupStopMarkers(map, stopsRef.current);
    });

    mapRef.current = map;

    const busMarkers = busMarkersRef.current;
    return () => {
      busMarkers.forEach((m) => m.remove());
      busMarkers.clear();
      map.remove();
      mapRef.current = null;
      threeLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync buses with Three.js layer
  useEffect(() => {
    const layer = threeLayerRef.current;
    if (layer) {
      const snappedBuses = buses.map((b) => {
        if (selectedBus && b.id === selectedBus.id && routeMetrics.snappedBusCoords) {
          return {
            ...b,
            longitude: routeMetrics.snappedBusCoords[0],
            latitude: routeMetrics.snappedBusCoords[1],
          };
        }
        return b;
      });
      layer.updateBuses(snappedBuses);
    }
  }, [buses, selectedBus, routeMetrics.snappedBusCoords]);

  // Auto-follow: Camera smoothly glides along with the bus following road curves ("buser shate shate map jave")
  useEffect(() => {
    if (!isFollowing || !selectedBus) return;
    const map = mapRef.current;
    if (!map) return;

    const coords = routeMetrics.snappedBusCoords || [selectedBus.longitude, selectedBus.latitude];
    const busHeading =
      selectedBus.heading != null && !isNaN(selectedBus.heading) && selectedBus.heading !== 0
        ? selectedBus.heading
        : routeMetrics.roadHeading || 165;

    map.easeTo({
      center: coords,
      bearing: is3DMode ? busHeading - 10 : 0,
      pitch: is3DMode ? 58 : 0,
      zoom: 17.0,
      duration: 1200,
    });
  }, [
    isFollowing,
    selectedBus,
    routeMetrics.snappedBusCoords,
    routeMetrics.roadHeading,
    is3DMode,
  ]);

  // Sync buses with interactive MapLibre custom HTML markers (Realistic University Bus Vehicle Graphic on the road)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set<number>();

    buses.forEach((bus) => {
      currentIds.add(bus.id);
      const isSelected = bus.id === selectedBusId;
      const isMoving = bus.speed != null && bus.speed > 1;
      const heading =
        bus.heading != null && !isNaN(bus.heading) && bus.heading !== 0
          ? bus.heading
          : isSelected && routeMetrics.roadHeading
          ? routeMetrics.roadHeading
          : 165;
      const speedKmh = bus.speed != null ? Math.round(bus.speed * 3.6) : 0;
      const status = bus.status || (isMoving ? 'moving' : 'stopped');
      const busCoords =
        isSelected && routeMetrics.snappedBusCoords
          ? routeMetrics.snappedBusCoords
          : [bus.longitude, bus.latitude];
      const locationName = isSelected
        ? routeMetrics.currentLocationName
        : stops[0]?.name || 'IUBAT Permanent Campus';

      let marker = busMarkersRef.current.get(bus.id);

      if (!marker) {
        const el = document.createElement('div');
        el.className =
          'bus-gis-marker flex flex-col items-center select-none cursor-pointer group pointer-events-auto transition-transform hover:scale-105';
        el.innerHTML = `
          <!-- 1. Floating Location Tag (Green Pill matching reference image) -->
          <div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#007a4d] text-white shadow-2xl border border-emerald-400/60 font-extrabold text-xs tracking-wide whitespace-nowrap hover:bg-[#008f5a] transition">
            <span class="w-2 h-2 rounded-full bg-white shadow-sm inline-block shrink-0 animate-pulse"></span>
            <span class="location-name-text">${locationName}</span>
          </div>
          <div class="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#007a4d] mx-auto shadow-sm"></div>

          <!-- 2. Bus Number & Speed Badge -->
          <div class="mt-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-md border ${
            isSelected ? 'border-cyan-400 ring-2 ring-cyan-400/40 text-cyan-300' : 'border-white/20 text-white'
          } text-[10px] font-bold shadow-xl">
            <span class="status-dot w-1.5 h-1.5 rounded-full ${
              status === 'moving'
                ? 'bg-emerald-400 animate-ping'
                : status === 'stopped'
                ? 'bg-amber-400'
                : 'bg-slate-400'
            }"></span>
            <span class="bus-label">${bus.busNumber}</span>
            <span class="speed-badge px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">${
              speedKmh > 0 ? `${speedKmh} km/h` : 'LIVE'
            }</span>
          </div>
        `;
        el.onclick = (e) => {
          e.stopPropagation();
          handleBusClick(bus);
        };

        marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([busCoords[0], busCoords[1]])
          .addTo(map);

        busMarkersRef.current.set(bus.id, marker);
      } else {
        // Update marker position & dynamic state
        marker.setLngLat([busCoords[0], busCoords[1]]);
        const el = marker.getElement();
        const locationText = el.querySelector('.location-name-text') as HTMLElement | null;
        if (locationText) locationText.textContent = locationName;
        const speedBadge = el.querySelector('.speed-badge') as HTMLElement | null;
        if (speedBadge) speedBadge.textContent = speedKmh > 0 ? `${speedKmh} km/h` : 'LIVE';
        const statusDot = el.querySelector('.status-dot') as HTMLElement | null;
        if (statusDot) {
          statusDot.className = `status-dot w-1.5 h-1.5 rounded-full ${
            status === 'moving'
              ? 'bg-emerald-400 animate-ping'
              : status === 'stopped'
              ? 'bg-amber-400'
              : 'bg-slate-400'
          }`;
        }
      }
    });

    // Remove markers that are no longer active
    for (const [id, marker] of busMarkersRef.current.entries()) {
      if (!currentIds.has(id)) {
        marker.remove();
        busMarkersRef.current.delete(id);
      }
    }
  }, [buses, selectedBusId, routeMetrics, stops, handleBusClick]);

  // Sync Route geometry update
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      setupRouteLayers(map, routeMetrics.completed, routeMetrics.remaining);
    }
  }, [routeMetrics, setupRouteLayers]);

  // Sync stops
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded() && stops.length > 0) {
      setupStopMarkers(map, stops);
    }
  }, [stops, setupStopMarkers]);

  // Handle follow mode camera lock
  useEffect(() => {
    const layer = threeLayerRef.current;
    if (layer) {
      const targetId = isFollowing ? selectedBus?.id || followingBusId : null;
      layer.setFollowingBusId(targetId ?? null);
    }
  }, [isFollowing, selectedBus, followingBusId]);

  // Controls Handlers
  const handleToggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    if (is3DMode) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      setIs3DMode(false);
    } else {
      map.easeTo({ pitch: 58, bearing: -18, zoom: 16.2, duration: 1200 });
      setIs3DMode(true);
    }
  };

  const handleToggleFollow = () => {
    const next = !isFollowing;
    setIsFollowing(next);
    if (next && selectedBus) {
      mapRef.current?.flyTo({
        center: [selectedBus.longitude, selectedBus.latitude],
        zoom: 16.5,
        pitch: is3DMode ? 58 : 0,
        bearing: is3DMode ? selectedBus.heading || -18 : 0,
        duration: 1200,
      });
    }
  };

  const handleSelectLayer = (layer: MapLayerPreset) => {
    setActiveLayer(layer);
    activeLayerRef.current = layer;
    mapRef.current?.setStyle(BASE_STYLES[layer]);
  };

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 300 });
  const handleResetCamera = () => mapRef.current?.easeTo({ bearing: 0, duration: 800 });

  const handleLocateBus = () => {
    if (!selectedBus) return;
    mapRef.current?.flyTo({
      center: [selectedBus.longitude, selectedBus.latitude],
      zoom: 16.8,
      pitch: is3DMode ? 58 : 0,
      bearing: is3DMode ? selectedBus.heading || -18 : 0,
      duration: 1400,
    });
  };

  const handleShowAllBuses = () => {
    const map = mapRef.current;
    if (!map || buses.length === 0) return;

    if (buses.length === 1) {
      map.flyTo({
        center: [buses[0].longitude, buses[0].latitude],
        zoom: 15,
        duration: 1200,
      });
      return;
    }

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    buses.forEach((b) => {
      if (b.longitude < minLng) minLng = b.longitude;
      if (b.longitude > maxLng) maxLng = b.longitude;
      if (b.latitude < minLat) minLat = b.latitude;
      if (b.latitude > maxLat) maxLat = b.latitude;
    });

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 80, duration: 1400 }
    );
  };

  const handleLocateUser = () => {
    if (!userPosition) return;
    mapRef.current?.flyTo({
      center: [userPosition[1], userPosition[0]],
      zoom: 16,
      pitch: is3DMode ? 58 : 0,
      duration: 1200,
    });
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const currentSpeed = selectedBus?.speed ? Math.round(selectedBus.speed * 3.6) : 28;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-3xl shadow-2xl border border-slate-700/60 bg-slate-950 select-none ${
        isFullscreen ? 'h-screen w-screen rounded-none' : heightClass
      }`}
    >
      {/* MapLibre WebGL Canvas */}
      <div className="w-full h-full" />

      {/* Map Interface Controls (Top-left, Top-right, Right floating toolbar) */}
      <MapInterfaceControls
        selectedBusNumber={selectedBus?.busNumber}
        selectedRouteName={selectedBus?.routeName || routeName}
        isLiveTracking={true}
        is3DMode={is3DMode}
        isFollowing={isFollowing}
        activeLayer={activeLayer}
        onToggle3D={handleToggle3D}
        onToggleFollow={handleToggleFollow}
        onSelectLayer={handleSelectLayer}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetCamera={handleResetCamera}
        onLocateBus={handleLocateBus}
        onShowAllBuses={handleShowAllBuses}
        onLocateUser={handleLocateUser}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Clickable Bus Popup Card */}
      {popupBusData && (
        <div className="absolute top-20 left-4 z-40 pointer-events-auto animate-fade-in">
          <BusMarkerPopup
            data={popupBusData}
            onClose={() => setPopupBusData(null)}
            onFollow={(id) => {
              setSelectedBusId(id);
              setIsFollowing(true);
            }}
            isFollowing={isFollowing && selectedBusId === popupBusData.id}
          />
        </div>
      )}

      {/* Bus GIS Floating Bottom Dashboard */}
      {showHUD && selectedBus && (
        <FloatingBusHUD
          busNumber={selectedBus.busNumber}
          routeName={selectedBus.routeName || routeName}
          origin={originName}
          destination={destinationName}
          speedKmh={currentSpeed}
          currentLocationName={routeMetrics.currentLocationName}
          nextStopName={routeMetrics.nextStopName}
          distanceToNextKm={routeMetrics.distanceToNextKm}
          etaMinutes={routeMetrics.etaMinutes}
          routeProgressPercent={routeMetrics.progressPercent}
          lastUpdatedFormatted={
            selectedBus.lastUpdated
              ? new Date(selectedBus.lastUpdated).toLocaleTimeString()
              : 'Just now'
          }
          isConnected={true}
          statusText="LIVE GPS LOCKED"
          isFollowing={isFollowing}
          onToggleFollow={handleToggleFollow}
        />
      )}

      {/* Bottom-Right GIS Engine Watermark */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none hidden md:block">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-slate-400 shadow-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Ultra-HD 3D Satellite Engine</span>
        </div>
      </div>
    </div>
  );
}
