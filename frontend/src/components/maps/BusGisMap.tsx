'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
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
  getBusRoadHeading,
  getCurrentLocationName,
  getNextUpcomingStop,
  snapBusToRoad,
  splitRouteByBusPosition,
  type StopInfo,
} from '@/lib/map3d/routeGeometry';
import { isValidCoordinate, calculateDistanceMeters } from '@/lib/trackingStatus';
import FloatingBusHUD from './FloatingBusHUD';
import BusMarkerPopup, { type BusPopupData } from './BusMarkerPopup';
import MapInterfaceControls, { type MapLayerPreset } from './MapInterfaceControls';
import {
  PILOT_MAP_STYLE_URL,
  PILOT_MAP_BRIGHT_STYLE_URL,
  PILOT_MAP_DARK_STYLE_URL,
  IUBAT_CAMPUS_CENTER,
  DEFAULT_CAMERA_PITCH,
  ISOMETRIC_CAMERA_PITCH,
  PILOT_MAP_ATTRIBUTION,
  SATELLITE_IMAGERY_ENABLED,
} from '@/lib/mapConfig';

/**
 * 1. OpenFreeMap Liberty Vector Style (Pilot Approved Standard)
 * Fast, open-source vector tiles supporting 2D/3D extruded buildings (zero API key, 100% free).
 */
export const PILOT_LIBERTY_STYLE_URL = PILOT_MAP_STYLE_URL;

/**
 * 2. Esri High-Resolution World Imagery 3D (Bus GIS Satellite Style)
 * Authentic photographic satellite basemap with road geometry and boundaries.
 */
export const ESRI_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite-tiles': {
      type: 'raster',
      tiles: SATELLITE_IMAGERY_ENABLED
        ? [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ]
        : [],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri World Imagery, Maxar, Earthstar Geographics',
    },
    'esri-roads-tiles': {
      type: 'raster',
      tiles: SATELLITE_IMAGERY_ENABLED
        ? [
            'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
          ]
        : [],
      tileSize: 256,
      maxzoom: 19,
    },
    'esri-labels-tiles': {
      type: 'raster',
      tiles: SATELLITE_IMAGERY_ENABLED
        ? [
            'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          ]
        : [],
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

export const BASE_STYLES: Record<string, string | StyleSpecification> = {
  liberty: PILOT_MAP_STYLE_URL,
  bright: PILOT_MAP_BRIGHT_STYLE_URL,
  dark: PILOT_MAP_DARK_STYLE_URL,
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  // Backward compatibility: satellite layers safely map to pilot vector basemap (unauthenticated Esri calls disabled)
  satellite: PILOT_MAP_STYLE_URL,
  'mapbox-satellite': PILOT_MAP_STYLE_URL,
};

// IUBAT Permanent Campus: 4 Embankment Drive Road, Sector 10, Uttara Model Town, Dhaka 1230
const DEFAULT_CENTER: [number, number] = IUBAT_CAMPUS_CENTER;

export interface BusGisMapProps {
  buses?: ActiveBusData[];
  routePath?: [number, number][]; // [longitude, latitude][] planned route
  roadGeometry?: [number, number][];
  breadcrumbTrail?: [number, number][]; // [longitude, latitude][] historical GPS breadcrumbs
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
  roadGeometry: roadGeometryProp,
  breadcrumbTrail,
  stops = [],
  routeName = 'IUBAT Transit Line',
  originName = 'Origin Terminal',
  destinationName = 'Destination Terminal',
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
  const userMarkerRef = useRef<Marker | null>(null);
  const breadcrumbTrailRef = useRef(breadcrumbTrail);
  breadcrumbTrailRef.current = breadcrumbTrail;

  const [is3DMode, setIs3DMode] = useState(true); // Default to True 3D mode with custom IUBAT bus model
  const [activeLayer, setActiveLayer] = useState<MapLayerPreset>('liberty');
  const [selectedBusId, setSelectedBusId] = useState<number | null>(focusedBusId);
  const [isFollowing, setIsFollowing] = useState<boolean>(false); // Allow free panning by default; enable follow on click
  const [popupBusData, setPopupBusData] = useState<BusPopupData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // True road geometry is present ONLY when delivered via roadGeometryProp or routePath from backend RouteRevision.
  // If routePath is merely an echo of stop coordinates, it is recognized as schematic fallback (NOT road-snapped geometry).
  const isTrueRoadGeometry = useMemo(() => {
    if (roadGeometryProp && roadGeometryProp.length >= 2) return true;
    if (routePath && routePath.length >= 2) {
      if (!stops || stops.length < 2) return true;
      if (routePath.length === stops.length) {
        const isJustStops = routePath.every(
          (pt, i) => Math.abs(pt[0] - stops[i].longitude) < 0.00001 && Math.abs(pt[1] - stops[i].latitude) < 0.00001
        );
        if (isJustStops) return false;
      }
      return true;
    }
    return false;
  }, [roadGeometryProp, routePath, stops]);

  // Selected bus object
  const selectedBus = useMemo(() => {
    return buses.find((b) => b.id === selectedBusId) || (buses.length > 0 ? buses[0] : null);
  }, [buses, selectedBusId]);

  const userDistanceKm = useMemo(() => {
    if (!userPosition || !selectedBus) return null;
    const [uLat, uLng] = userPosition;
    if (!isValidCoordinate(uLat, uLng) || !isValidCoordinate(selectedBus.latitude, selectedBus.longitude)) {
      return null;
    }
    const meters = calculateDistanceMeters(uLat, uLng, selectedBus.latitude, selectedBus.longitude);
    return meters / 1000;
  }, [userPosition, selectedBus]);

  // Estimated travel time to reach bus location (based on current bus speed or average city transit speed)
  const userTravelMinutes = useMemo(() => {
    if (userDistanceKm == null) return null;
    // If distance < 50 meters, effectively arrived
    if (userDistanceKm < 0.05) return 0;
    // Use measured vehicle speed if positive, otherwise use standard city transit pace (25 km/h) with 20% traffic buffer
    const speed = (selectedBus?.speed && Number(selectedBus.speed) > 2)
      ? Number(selectedBus.speed) * 3.6
      : 25;
    const hours = (userDistanceKm / speed) * 1.2;
    return Math.max(1, Math.round(hours * 60));
  }, [userDistanceKm, selectedBus?.speed]);

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
        status:
          bus.status ||
          (bus.speed && bus.speed > 1 ? 'moving' : bus.speed != null ? 'stopped' : 'live'),
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

  // Active planned route path
  const activeRoadPath = useMemo(() => {
    if (roadGeometryProp && roadGeometryProp.length >= 2) return roadGeometryProp;
    if (routePath && routePath.length >= 2) return routePath;
    if (stops && stops.length >= 2) return stops.map((s) => [s.longitude, s.latitude] as [number, number]);
    // Do NOT fabricate fallback routes when geometry is unavailable
    return [] as [number, number][];
  }, [roadGeometryProp, routePath, stops]);

  // Calculate route split (completed vs remaining), progress, current location, road heading, and next stop
  const routeMetrics = useMemo(() => {
    if (!selectedBus) {
      return {
        completed: [] as [number, number][],
        remaining: activeRoadPath,
        progressPercent: 0,
        currentLocationName: stops[0]?.name || originName,
        nextStopName: stops[1]?.name || '—',
        distanceToNextKm: null as number | null,
        etaMinutes: null as number | null,
        snappedBusCoords: null as [number, number] | null,
        roadHeading: 0,
      };
    }

    const hasRoad = activeRoadPath.length >= 2;

    // CRITICAL ROUTE GEOMETRY INTEGRITY:
    // Snap bus GPS coordinates to the nearest road point ONLY if authentic planned road geometry is available.
    // When only schematic stop connections exist, NEVER snap to straight lines (preserves authentic GPS coordinates).
    const snappedBusCoords: [number, number] = (isTrueRoadGeometry && hasRoad)
      ? snapBusToRoad(selectedBus.longitude, selectedBus.latitude, activeRoadPath)
      : [selectedBus.longitude, selectedBus.latitude];

    const roadHeading = (isTrueRoadGeometry && hasRoad)
      ? getBusRoadHeading(
          snappedBusCoords[0],
          snappedBusCoords[1],
          activeRoadPath,
          selectedBus.heading || 165
        )
      : (selectedBus.heading || 0);

    const { completed, remaining, progressPercent } = hasRoad
      ? splitRouteByBusPosition(snappedBusCoords[0], snappedBusCoords[1], activeRoadPath)
      : { completed: [] as [number, number][], remaining: [] as [number, number][], progressPercent: 0 };

    const { nextStop, distanceKm, estimatedMinutes } = stops.length > 0
      ? getNextUpcomingStop(snappedBusCoords[0], snappedBusCoords[1], stops)
      : { nextStop: null, distanceKm: 0, estimatedMinutes: 0 };

    const currentLocationName = stops.length > 0
      ? getCurrentLocationName(snappedBusCoords[0], snappedBusCoords[1], stops)
      : null;

    return {
      completed,
      remaining,
      progressPercent,
      currentLocationName: currentLocationName || stops[0]?.name || originName,
      nextStopName: nextStop?.name || '—',
      distanceToNextKm: stops.length > 0 ? distanceKm : null,
      etaMinutes: stops.length > 0 ? estimatedMinutes : null,
      snappedBusCoords,
      roadHeading,
    };
  }, [selectedBus, activeRoadPath, stops, originName, isTrueRoadGeometry]);

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
        features:
          completedCoords.length >= 2
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: completedCoords,
                  },
                },
              ]
            : [],
      };

      // 2. Remaining Route GeoJSON
      const remainingGeoJSON: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features:
          remainingCoords.length >= 2
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: remainingCoords,
                  },
                },
              ]
            : [],
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

  // Dedicated historical GPS breadcrumb layer (visually distinct from planned route)
  const setupBreadcrumbLayer = useCallback((map: MapLibreMap, trailCoords: [number, number][]) => {
    const geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: 'FeatureCollection',
      features:
        trailCoords.length >= 2
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: trailCoords,
                },
              },
            ]
          : [],
    };

    const source = map.getSource('breadcrumb-trail-source') as GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
      return;
    }

    if (!map.getSource('breadcrumb-trail-source')) {
      map.addSource('breadcrumb-trail-source', {
        type: 'geojson',
        data: geojson,
      });
    }

    if (!map.getLayer('breadcrumb-trail-line')) {
      map.addLayer({
        id: 'breadcrumb-trail-line',
        type: 'line',
        source: 'breadcrumb-trail-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#2563eb', // Solid distinct blue for historical GPS trail
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });
    }
  }, []);

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
      style: BASE_STYLES[activeLayer] || PILOT_MAP_STYLE_URL,
      center: initialCenter,
      zoom: 16.5,
      pitch: ISOMETRIC_CAMERA_PITCH,
      bearing: 0,
      maxPitch: 82,
      maxZoom: 22,
      minZoom: 3,
      fadeDuration: 0,
      attributionControl: false,
    });

    map.addControl(
      new AttributionControl({
        customAttribution: PILOT_MAP_ATTRIBUTION,
      }),
      'bottom-right'
    );

    const threeLayer = new ThreeMap3DLayer('3d-bus-gis-vehicles');
    threeLayerRef.current = threeLayer;

    map.on('style.load', () => {
      // 1. Add 3D Extrusions (only if 3D mode is enabled by user)
      if (is3DMode) {
        setup3DBuildings(map);
      }

      // 2. Add Three.js Bus Model Layer (only if 3D mode is enabled by user)
      if (is3DMode && threeLayerRef.current && !map.getLayer(threeLayerRef.current.id)) {
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

      // 5. Add Dedicated Historical Breadcrumb Layer
      setupBreadcrumbLayer(map, breadcrumbTrailRef.current || []);
    });

    // Auto-disable follow lock if user interacts with the map (pan, touch, zoom, rotate)
    map.on('dragstart', () => setIsFollowing(false));
    map.on('touchstart', () => setIsFollowing(false));
    map.on('rotatestart', () => setIsFollowing(false));
    map.on('pitchstart', () => setIsFollowing(false));

    mapRef.current = map;

    const busMarkers = busMarkersRef.current;
    return () => {
      busMarkers.forEach((m) => m.remove());
      busMarkers.clear();
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
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
      pitch: is3DMode ? ISOMETRIC_CAMERA_PITCH : DEFAULT_CAMERA_PITCH,
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
      const speedKmh =
        bus.speed != null && !isNaN(Number(bus.speed))
          ? Math.max(0, Math.round(Number(bus.speed) * 3.6))
          : null;
      const status = bus.status || (isMoving ? 'moving' : bus.speed != null ? 'stopped' : 'live');
      const busCoords =
        isSelected && routeMetrics.snappedBusCoords
          ? routeMetrics.snappedBusCoords
          : [bus.longitude, bus.latitude];
      // Compute truthful marker badge text
      const markerBadgeText =
        status === 'offline'
          ? 'OFFLINE'
          : status === 'stale'
          ? 'STALE'
          : speedKmh != null
          ? `${speedKmh} km/h`
          : 'LIVE';

      const locationName = isSelected
        ? routeMetrics.currentLocationName
        : stops[0]?.name || 'IUBAT Permanent Campus';

      let marker = busMarkersRef.current.get(bus.id);

      if (!marker) {
        const el = document.createElement('div');
        // Compact badge positioned cleanly above the 3D vehicle without masking it
        el.className =
          'bus-gis-marker flex flex-col items-center select-none cursor-pointer group pointer-events-auto transition-transform hover:scale-105';
        el.innerHTML = `
          <!-- 1. Floating Location Tag (Green Pill matching prototype) -->
          <div class="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#007a4d]/95 text-white shadow-lg border border-emerald-400/50 font-bold text-[10px] tracking-wide whitespace-nowrap hover:bg-[#008f5a] transition">
            <span class="w-1.5 h-1.5 rounded-full bg-white shadow-sm inline-block shrink-0 animate-pulse"></span>
            <span class="location-name-text">${locationName}</span>
          </div>
          <div class="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-[#007a4d] mx-auto shadow-sm"></div>

          <!-- 2. Bus Number & Speed Badge -->
          <div class="mt-0.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-md border ${
            isSelected ? 'border-cyan-400 ring-1 ring-cyan-400/50 text-cyan-300' : 'border-white/20 text-white'
          } text-[9px] font-bold shadow-lg">
            <span class="status-dot w-1.5 h-1.5 rounded-full ${
              status === 'moving'
                ? 'bg-emerald-400 animate-ping'
                : status === 'stopped'
                ? 'bg-amber-400'
                : status === 'live'
                ? 'bg-emerald-400'
                : status === 'stale'
                ? 'bg-amber-500'
                : 'bg-slate-400'
            }"></span>
            <span class="bus-label">${bus.busNumber}</span>
            <span class="speed-badge px-1 py-0.2 rounded ${
              status === 'offline'
                ? 'bg-slate-800 text-slate-400'
                : status === 'stale'
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-cyan-500/20 text-cyan-300'
            } text-[8px] font-mono">${markerBadgeText}</span>
          </div>
        `;
        el.onclick = (e) => {
          e.stopPropagation();
          handleBusClick(bus);
        };

        // Offset upward (e.g. 50px above road surface) so 3D Three.js vehicle model is completely visible below the badge
        marker = new Marker({ element: el, anchor: 'bottom', offset: [0, -45] })
          .setLngLat([busCoords[0], busCoords[1]])
          .addTo(map);

        busMarkersRef.current.set(bus.id, marker);
      } else {
        // Update marker position & dynamic state
        marker.setLngLat([busCoords[0], busCoords[1]]);
        marker.setOffset([0, -45]);
        const el = marker.getElement();
        const locationText = el.querySelector('.location-name-text') as HTMLElement | null;
        if (locationText) locationText.textContent = locationName;
        const speedBadge = el.querySelector('.speed-badge') as HTMLElement | null;
        if (speedBadge) {
          speedBadge.textContent = markerBadgeText;
          speedBadge.className = `speed-badge px-1.5 py-0.2 rounded ${
            status === 'offline'
              ? 'bg-slate-800 text-slate-400'
              : status === 'stale'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-cyan-500/20 text-cyan-300'
          } text-[9px] font-mono`;
        }
        const statusDot = el.querySelector('.status-dot') as HTMLElement | null;
        if (statusDot) {
          statusDot.className = `status-dot w-1.5 h-1.5 rounded-full ${
            status === 'moving'
              ? 'bg-emerald-400 animate-ping'
              : status === 'stopped'
              ? 'bg-amber-400'
              : status === 'live'
              ? 'bg-emerald-400'
              : status === 'stale'
              ? 'bg-amber-500'
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

  // Sync historical breadcrumb trail
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      setupBreadcrumbLayer(map, breadcrumbTrail || []);
    }
  }, [breadcrumbTrail, setupBreadcrumbLayer]);

  // Track previous userPosition to fly camera when user triggers "My Location"
  const prevUserPosRef = useRef<[number, number] | null>(null);

  // Sync passenger location marker and fly to user when position first becomes available
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userPosition || !isValidCoordinate(userPosition[0], userPosition[1])) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const [userLat, userLng] = userPosition;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLng, userLat]);
    } else {
      const el = document.createElement('div');
      el.className = 'passenger-location-marker cursor-pointer';
      el.title = 'Your Location';
      el.innerHTML = `
        <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:32px;height:32px;border-radius:9999px;background:rgba(37,99,235,0.3);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.45);"></div>
        </div>
      `;
      userMarkerRef.current = new Marker({ element: el })
        .setLngLat([userLng, userLat])
        .addTo(map);
    }

    // If user position just changed (e.g. from user clicking "My Location" or first GPS acquisition), fly camera to user
    const prev = prevUserPosRef.current;
    const isNewPos = !prev || Math.abs(prev[0] - userLat) > 0.0001 || Math.abs(prev[1] - userLng) > 0.0001;
    if (isNewPos) {
      prevUserPosRef.current = userPosition;
      map.flyTo({
        center: [userLng, userLat],
        zoom: 16.2,
        pitch: is3DMode ? ISOMETRIC_CAMERA_PITCH : DEFAULT_CAMERA_PITCH,
        duration: 1200,
      });
    }
  }, [userPosition, is3DMode]);

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
      if (map.getLayer('3d-buildings-extrusion')) {
        map.setLayoutProperty('3d-buildings-extrusion', 'visibility', 'none');
      }
      if (threeLayerRef.current && map.getLayer(threeLayerRef.current.id)) {
        map.removeLayer(threeLayerRef.current.id);
      }
      map.easeTo({ pitch: DEFAULT_CAMERA_PITCH, bearing: 0, duration: 1000 });
      setIs3DMode(false);
    } else {
      setup3DBuildings(map);
      if (map.getLayer('3d-buildings-extrusion')) {
        map.setLayoutProperty('3d-buildings-extrusion', 'visibility', 'visible');
      }
      if (threeLayerRef.current && !map.getLayer(threeLayerRef.current.id)) {
        map.addLayer(threeLayerRef.current);
      }
      map.easeTo({ pitch: ISOMETRIC_CAMERA_PITCH, bearing: -18, zoom: 16.2, duration: 1200 });
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
        pitch: is3DMode ? ISOMETRIC_CAMERA_PITCH : DEFAULT_CAMERA_PITCH,
        bearing: is3DMode ? selectedBus.heading || -18 : 0,
        duration: 1200,
      });
    }
  };

  const handleSelectLayer = (layer: MapLayerPreset) => {
    setActiveLayer(layer);
    activeLayerRef.current = layer;
    mapRef.current?.setStyle(BASE_STYLES[layer] || PILOT_MAP_STYLE_URL);
  };

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 300 });
  const handleResetCamera = () => mapRef.current?.easeTo({ bearing: 0, duration: 800 });

  const handleLocateBus = () => {
    if (!selectedBus) return;
    mapRef.current?.flyTo({
      center: [selectedBus.longitude, selectedBus.latitude],
      zoom: 16.8,
      pitch: is3DMode ? ISOMETRIC_CAMERA_PITCH : DEFAULT_CAMERA_PITCH,
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

  const currentSpeed =
    selectedBus?.speed != null && !isNaN(Number(selectedBus.speed))
      ? Math.max(0, Math.round(Number(selectedBus.speed) * 3.6))
      : null;

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
        isLiveTracking={Boolean(selectedBus && selectedBus.status !== 'offline')}
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
          userDistanceKm={userDistanceKm}
          userTravelMinutes={userTravelMinutes}
          etaMinutes={routeMetrics.etaMinutes}
          routeProgressPercent={routeMetrics.progressPercent}
          lastUpdatedFormatted={
            selectedBus.lastUpdated
              ? new Date(selectedBus.lastUpdated).toLocaleTimeString()
              : 'Just now'
          }
          isConnected={selectedBus.status !== 'offline'}
          statusText={
            selectedBus.status === 'moving'
              ? 'LIVE (MOVING)'
              : selectedBus.status === 'stopped'
              ? 'LIVE (STOPPED)'
              : selectedBus.status === 'live'
              ? 'LIVE'
              : selectedBus.status === 'stale'
              ? 'STALE SIGNAL'
              : 'OFFLINE'
          }
          isFollowing={isFollowing}
          onToggleFollow={handleToggleFollow}
        />
      )}

      {/* Truthful Empty State Overlay when no active buses are streaming telemetry */}
      {buses.length === 0 && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-4">
          <div className="px-5 py-4 bg-slate-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-center max-w-sm pointer-events-auto">
            <p className="text-sm font-bold text-white">No Live Buses</p>
            <p className="text-xs text-slate-400 mt-1">
              No buses are currently sharing live locations. Telemetry will appear automatically when journeys start.
            </p>
          </div>
        </div>
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
