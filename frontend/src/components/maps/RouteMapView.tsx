'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Stop } from '@/lib/types';

interface Props {
  stops: Stop[];
  color?: string;
  onMapClick?: (lat: number, lng: number) => void;
  pickedCoords?: [number, number] | null;
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function RouteMapView({
  stops,
  color = '#2563eb',
  onMapClick,
  pickedCoords,
  heightClass = 'h-80',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      pickMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick(Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7)));
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [onMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();

    const coords: [number, number][] = [];
    stops.forEach((s, idx) => {
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      coords.push([lat, lng]);
      L.circleMarker([lat, lng], {
        radius: s.is_major_stop ? 9 : 6,
        fillColor: s.is_major_stop ? '#ef4444' : color,
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<strong>#${idx + 1} ${s.name}</strong>${
            s.scheduled_time ? `<br/>Scheduled: ${s.scheduled_time}` : ''
          }`
        )
        .addTo(group);
    });

    if (coords.length >= 2) {
      L.polyline(coords, { color, weight: 4, opacity: 0.85 }).addTo(group);
    }
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [stops, color]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pickMarkerRef.current) {
      map.removeLayer(pickMarkerRef.current);
      pickMarkerRef.current = null;
    }
    if (pickedCoords) {
      pickMarkerRef.current = L.circleMarker(pickedCoords, {
        radius: 8,
        fillColor: '#16a34a',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup('Selected Stop Location')
        .openPopup();
    }
  }, [pickedCoords]);

  return <div ref={containerRef} className={`w-full rounded-xl overflow-hidden border border-slate-200 ${heightClass}`} />;
}
