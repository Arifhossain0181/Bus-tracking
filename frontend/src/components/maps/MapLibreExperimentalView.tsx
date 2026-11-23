'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  leafletToMapLibreCoords,
  normalizeBearing,
} from '@/lib/maplibreUtils';
import {
  PILOT_MAP_STYLE_URL,
  PILOT_MAP_BRIGHT_STYLE_URL,
  PILOT_MAP_FALLBACK_STYLE_URL,
} from '@/lib/mapConfig';

interface Props {
  busLocation: {
    lat: number;
    lng: number;
    heading: number;
    speed: number;
    busNumber: string;
  };
  trail: [number, number][]; // [lat, lng]
  plannedRoute?: [number, number][]; // [lat, lng]
  is3D: boolean;
  pitch: number;
  bearing: number;
  zoom?: number;
  mapStyleId: string;
  heightClass?: string;
  onCameraChange?: (camera: { pitch: number; bearing: number; zoom: number }) => void;
  followBus?: boolean;
}

const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

function getStyleSpecification(styleId: string): string | maplibregl.StyleSpecification {
  switch (styleId) {
    case 'openfreemap-bright':
      return PILOT_MAP_BRIGHT_STYLE_URL;
    case 'demotiles':
      return PILOT_MAP_FALLBACK_STYLE_URL;
    case 'osm-raster':
      return OSM_RASTER_STYLE;
    case 'openfreemap-liberty':
    default:
      return PILOT_MAP_STYLE_URL;
  }
}

export default function MapLibreExperimentalView({
  busLocation,
  trail,
  plannedRoute = [],
  pitch,
  bearing,
  zoom = 15.5,
  mapStyleId,
  heightClass = 'h-[520px]',
  onCameraChange,
  followBus = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const markerElRef = useRef<HTMLDivElement | null>(null);
  const arrowElRef = useRef<HTMLDivElement | null>(null);

  // Setup layers (route, trail, 3D buildings) once style is loaded
  const setupLayers = useCallback((map: maplibregl.Map) => {
    // 1. Planned Route Layer
    const routeCoords = plannedRoute.map(leafletToMapLibreCoords);
    if (!map.getSource('planned-route')) {
      map.addSource('planned-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeCoords,
          },
        },
      });
      map.addLayer({
        id: 'planned-route-line',
        type: 'line',
        source: 'planned-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#4f46e5', // Indigo
          'line-width': 4.5,
          'line-opacity': 0.7,
          'line-dasharray': [2, 1],
        },
      });
    }

    // 2. Traveled Breadcrumb Trail Layer
    const trailCoords = trail.map(leafletToMapLibreCoords);
    if (!map.getSource('breadcrumb-trail')) {
      map.addSource('breadcrumb-trail', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: trailCoords,
          },
        },
      });
      map.addLayer({
        id: 'breadcrumb-trail-line',
        type: 'line',
        source: 'breadcrumb-trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#0284c7', // Sky Blue
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });
    }

    // 3. 3D Extruded Buildings (if vector source supports it)
    if (map.getSource('openmaptiles') && !map.getLayer('3d-buildings')) {
      try {
        const layers = map.getStyle().layers;
        const labelLayer = layers?.find(
          (l: maplibregl.LayerSpecification) =>
            l.type === 'symbol' &&
            l.layout &&
            Boolean((l.layout as Record<string, unknown>)['text-field'])
        );

        map.addLayer(
          {
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            filter: ['!=', 'extrude', 'false'],
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'render_height'],
                0,
                '#e2e8f0',
                20,
                '#cbd5e1',
                50,
                '#94a3b8',
                100,
                '#64748b',
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14,
                0,
                15.05,
                ['coalesce', ['get', 'render_height'], ['get', 'height'], 12],
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14,
                0,
                15.05,
                ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
              ],
              'fill-extrusion-opacity': 0.78,
            },
          },
          labelLayer ? labelLayer.id : undefined
        );
      } catch {
        // Source layer not supported in this style
      }
    }
  }, [plannedRoute, trail]);

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyleSpecification(mapStyleId),
      center: [busLocation.lng, busLocation.lat],
      zoom: zoom,
      pitch: pitch,
      bearing: bearing,
      maxPitch: 85,
      touchPitch: true,
      touchZoomRotate: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      setupLayers(map);
    });

    const reportCamera = () => {
      onCameraChange?.({
        pitch: Math.round(map.getPitch()),
        bearing: Math.round(normalizeBearing(map.getBearing())),
        zoom: Number(map.getZoom().toFixed(2)),
      });
    };

    map.on('move', reportCamera);
    map.on('pitchend', reportCamera);
    map.on('rotateend', reportCamera);

    mapRef.current = map;

    // Create 3D bus marker DOM element
    const el = document.createElement('div');
    el.className = 'maplibre-bus-marker-container';
    el.style.width = '48px';
    el.style.height = '48px';
    el.style.position = 'relative';
    el.style.cursor = 'pointer';

    const arrow = document.createElement('div');
    arrow.className = 'maplibre-marker-arrow';
    arrow.style.position = 'absolute';
    arrow.style.top = '-8px';
    arrow.style.left = '16px';
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '8px solid transparent';
    arrow.style.borderRight = '8px solid transparent';
    arrow.style.borderBottom = '12px solid #dc2626';
    arrow.style.transformOrigin = '50% 32px';
    arrow.style.transition = 'transform 0.3s ease-out';
    arrow.style.transform = `rotate(${busLocation.heading}deg)`;
    arrowElRef.current = arrow;

    const core = document.createElement('div');
    core.className = 'maplibre-marker-core';
    core.style.width = '48px';
    core.style.height = '48px';
    core.style.borderRadius = '9999px';
    core.style.background = '#dc2626';
    core.style.border = '3px solid #ffffff';
    core.style.color = '#ffffff';
    core.style.display = 'flex';
    core.style.alignItems = 'center';
    core.style.justifyContent = 'center';
    core.style.fontWeight = '700';
    core.style.fontSize = '12px';
    core.style.boxShadow = '0 6px 16px rgba(0,0,0,0.45)';
    core.innerText = (busLocation.busNumber || 'BUS').slice(0, 4);

    el.appendChild(arrow);
    el.appendChild(core);
    markerElRef.current = el;

    const marker = new maplibregl.Marker({
      element: el,
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })
      .setLngLat([busLocation.lng, busLocation.lat])
      .addTo(map);

    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      markerElRef.current = null;
      arrowElRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map style when changed by user
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(getStyleSpecification(mapStyleId));
    map.once('style.load', () => {
      setupLayers(map);
    });
  }, [mapStyleId, setupLayers]);

  // Smoothly apply pitch and bearing changes from controls
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (Math.abs(map.getPitch() - pitch) > 1 || Math.abs(map.getBearing() - bearing) > 1) {
      map.easeTo({
        pitch,
        bearing,
        duration: 600,
      });
    }
  }, [pitch, bearing]);

  // Update Marker Position and Heading
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLngLat([busLocation.lng, busLocation.lat]);

    if (arrowElRef.current) {
      arrowElRef.current.style.transform = `rotate(${busLocation.heading}deg)`;
    }

    if (followBus) {
      map.panTo([busLocation.lng, busLocation.lat], { duration: 400 });
    }
  }, [busLocation, followBus]);

  // Update GeoJSON Trail in-place
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const trailSource = map.getSource('breadcrumb-trail') as maplibregl.GeoJSONSource | undefined;
    if (trailSource) {
      const trailCoords = trail.map(leafletToMapLibreCoords);
      trailSource.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: trailCoords,
        },
      });
    }
  }, [trail]);

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-md ${heightClass}`}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
