'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface Props {
  latitude: number | null;
  longitude: number | null;
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function MiniLocationMap({ latitude, longitude, heightClass = 'h-64' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude == null || longitude == null) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    } else {
      markerRef.current = L.circleMarker([latitude, longitude], {
        radius: 10,
        fillColor: '#16a34a',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup('Your Live GPS Position');
    }
    map.setView([latitude, longitude], 16);
  }, [latitude, longitude]);

  return <div ref={containerRef} className={`w-full rounded-xl overflow-hidden border border-slate-200 ${heightClass}`} />;
}
