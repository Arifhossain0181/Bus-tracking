'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface Props {
  path: { lat: number; lng: number; timestamp: string }[];
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function JourneyPathMapView({ path, heightClass = 'h-[450px]' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    const coords: [number, number][] = path.map((p) => [p.lat, p.lng]);
    if (coords.length > 0) {
      L.circleMarker(coords[0], {
        radius: 8,
        fillColor: '#16a34a',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(`<strong>Start</strong><br/>${new Date(path[0].timestamp).toLocaleString()}`);

      if (coords.length > 1) {
        L.polyline(coords, { color: '#2563eb', weight: 4 }).addTo(map);
        const last = coords[coords.length - 1];
        L.circleMarker(last, {
          radius: 8,
          fillColor: '#dc2626',
          color: '#ffffff',
          weight: 2,
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup(
            `<strong>End</strong><br/>${new Date(path[path.length - 1].timestamp).toLocaleString()}`
          );
      }

      map.fitBounds(L.latLngBounds(coords), { padding: [30, 30], maxZoom: 16 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [path]);

  return <div ref={containerRef} className={`w-full rounded-xl overflow-hidden border border-slate-200 ${heightClass}`} />;
}
