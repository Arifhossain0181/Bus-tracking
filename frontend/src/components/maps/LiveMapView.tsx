'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { ActiveDriverLocation } from '@/lib/types';

interface Props {
  drivers: ActiveDriverLocation[];
  userPosition: [number, number] | null;
  focusedDriverId: number | null;
  followingDriverId: number | null;
  onSelectDriver?: (driverId: number) => void;
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function LiveMapView({
  drivers,
  userPosition,
  focusedDriverId,
  followingDriverId,
  onSelectDriver,
  heightClass = 'h-[520px]',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      userMarkerRef.current = null;
    };
  }, []);

  // Update active bus/driver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(drivers.map((d) => d.driver_id));
    for (const [id, marker] of markersRef.current.entries()) {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    }

    drivers.forEach((d) => {
      const speedKmh = d.speed != null ? Math.round(d.speed * 3.6) : 0;
      const isFollowing = followingDriverId === d.driver_id;
      const icon = L.divIcon({
        className: '',
        html: `<div class="bus-marker-pulse" style="width:40px;height:40px;border-radius:9999px;background:${
          isFollowing ? '#dc2626' : '#f59e0b'
        };border:3px solid #ffffff;display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:700;font-size:12px;box-shadow:0 3px 10px rgba(0,0,0,0.35);">${
          d.bus_number ? d.bus_number.slice(0, 4) : 'BUS'
        }</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const popupHtml = `
        <div style="min-width:170px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Bus ${d.bus_number || 'N/A'}</div>
          <div style="font-size:12px;color:#475569;">Route: <strong>${d.route_name || 'Unassigned'}</strong></div>
          <div style="font-size:12px;color:#475569;">Driver: ${d.driver_name}</div>
          <div style="font-size:12px;color:#475569;">Speed: ${speedKmh} km/h</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Updated: ${new Date(
            d.last_updated
          ).toLocaleTimeString()}</div>
        </div>
      `;

      const existing = markersRef.current.get(d.driver_id);
      if (existing) {
        existing.setLatLng([d.latitude, d.longitude]);
        existing.setIcon(icon);
        existing.setPopupContent(popupHtml);
      } else {
        const marker = L.marker([d.latitude, d.longitude], { icon })
          .addTo(map)
          .bindPopup(popupHtml);
        marker.on('click', () => {
          onSelectDriver?.(d.driver_id);
        });
        markersRef.current.set(d.driver_id, marker);
      }

      if (followingDriverId === d.driver_id) {
        map.panTo([d.latitude, d.longitude]);
      }
    });
  }, [drivers, followingDriverId, onSelectDriver]);

  // Focus specific driver on click or query param
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedDriverId) return;
    const target = drivers.find((d) => d.driver_id === focusedDriverId);
    if (target) {
      map.setView([target.latitude, target.longitude], 16);
      markersRef.current.get(focusedDriverId)?.openPopup();
    }
  }, [focusedDriverId, drivers]);

  // User position marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 0 0 4px rgba(37,99,235,0.25);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userPosition);
    } else {
      userMarkerRef.current = L.marker(userPosition, { icon })
        .addTo(map)
        .bindPopup('<strong>Your Location</strong>');
    }
    map.setView(userPosition, 15);
  }, [userPosition]);

  return <div ref={containerRef} className={`w-full rounded-xl overflow-hidden border border-slate-200 ${heightClass}`} />;
}
