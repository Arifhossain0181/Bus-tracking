'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface Props {
  latitude: number | null;
  longitude: number | null;
  busNumber: string;
  trail: [number, number][];
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function BusFollowMapView({
  latitude,
  longitude,
  busNumber,
  trail,
  heightClass = 'h-[480px]',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const centeredOnceRef = useRef(false);

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
      polylineRef.current = null;
      centeredOnceRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude == null || longitude == null) return;

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:42px;height:42px;border-radius:9999px;background:#dc2626;border:3px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 3px 10px rgba(0,0,0,0.35);">${busNumber.slice(
        0,
        4
      )}</div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    } else {
      markerRef.current = L.marker([latitude, longitude], { icon })
        .addTo(map)
        .bindPopup(`<strong>Bus ${busNumber}</strong>`);
    }

    if (!centeredOnceRef.current) {
      map.setView([latitude, longitude], 16);
      centeredOnceRef.current = true;
    } else {
      map.panTo([latitude, longitude]);
    }
  }, [latitude, longitude, busNumber]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    if (trail.length >= 2) {
      polylineRef.current = L.polyline(trail, { color: '#2563eb', weight: 4 }).addTo(map);
    }
  }, [trail]);

  return <div ref={containerRef} className={`w-full rounded-xl overflow-hidden border border-slate-200 ${heightClass}`} />;
}
