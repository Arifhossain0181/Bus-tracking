'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { isValidCoordinate } from '@/lib/trackingStatus';
import { Crosshair } from 'lucide-react';

interface Props {
  latitude: number | null;
  longitude: number | null;
  busNumber: string;
  trail: [number, number][];
  heightClass?: string;
  heading?: number | null;
  speed?: number | null;
  isAccurate?: boolean;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function BusFollowMapView({
  latitude,
  longitude,
  busNumber,
  trail,
  heightClass = 'h-[500px]',
  heading = null,
  speed = null,
  isAccurate = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const centeredOnceRef = useRef(false);
  const [hasValidFix, setHasValidFix] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = isValidCoordinate(latitude, longitude)
      ? ([Number(latitude), Number(longitude)] as [number, number])
      : DEFAULT_CENTER;

    const map = L.map(containerRef.current, {
      zoomControl: true,
    }).setView(initialCenter, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      polylineRef.current = null;
      centeredOnceRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Center / Recenter map handler
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !isValidCoordinate(latitude, longitude)) return;
    map.setView([Number(latitude), Number(longitude)], 16, { animate: true });
  }, [latitude, longitude]);

  // Update Marker & Camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasValidCoords = isValidCoordinate(latitude, longitude);
    setHasValidFix(hasValidCoords);

    if (!hasValidCoords || latitude == null || longitude == null) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        map.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
      return;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    // Directional heading indicator HTML
    const validHeading = typeof heading === 'number' && !isNaN(heading) ? heading : null;
    const headingArrowHtml =
      validHeading != null
        ? `<div style="position:absolute;top:-6px;left:15px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #dc2626;transform:rotate(${validHeading}deg);transform-origin:50% 27px;"></div>`
        : '';

    const speedLabel =
      typeof speed === 'number' && !isNaN(speed) && speed > 0
        ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${Math.round(speed * 3.6)} km/h</div>`
        : '';

    const iconHtml = `
      <div style="position:relative;width:44px;height:44px;">
        ${headingArrowHtml}
        <div style="width:44px;height:44px;border-radius:9999px;background:#dc2626;border:3px solid #ffffff;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.35);">
          ${(busNumber || 'BUS').slice(0, 4)}
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'bus-follow-marker',
      html: iconHtml,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const popupHtml = `
      <div style="font-family:sans-serif;font-size:13px;line-height:1.4;">
        <strong style="color:#0f172a;font-size:14px;">Bus ${busNumber}</strong>
        ${speedLabel}
        ${!isAccurate ? '<div style="font-size:11px;color:#d97706;margin-top:4px;">Low GPS Accuracy</div>' : ''}
      </div>
    `;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(icon);
      markerRef.current.setPopupContent(popupHtml);
    } else {
      markerRef.current = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(popupHtml);
    }

    // Accuracy Circle visualization
    if (!isAccurate) {
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([lat, lng]);
      } else {
        accuracyCircleRef.current = L.circle([lat, lng], {
          radius: 75,
          color: '#f59e0b',
          weight: 1.5,
          dashArray: '4, 4',
          fillColor: '#fbbf24',
          fillOpacity: 0.15,
        }).addTo(map);
      }
    } else if (accuracyCircleRef.current) {
      map.removeLayer(accuracyCircleRef.current);
      accuracyCircleRef.current = null;
    }

    // Initial zoom vs subsequent pan
    if (!centeredOnceRef.current) {
      map.setView([lat, lng], 15, { animate: true });
      centeredOnceRef.current = true;
    } else {
      map.panTo([lat, lng], { animate: true, duration: 0.8 });
    }
  }, [latitude, longitude, busNumber, heading, speed, isAccurate]);

  // Update Breadcrumb Polyline in-place
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Filter valid coordinates in trail
    const validPoints = trail.filter(([tLat, tLng]) => isValidCoordinate(tLat, tLng));

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(validPoints);
    } else if (validPoints.length >= 2) {
      polylineRef.current = L.polyline(validPoints, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
    }
  }, [trail]);

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm ${heightClass}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Recenter button */}
      {hasValidFix && (
        <button
          onClick={handleRecenter}
          title="Recenter Map on Bus"
          className="absolute bottom-4 right-4 z-[500] flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-md text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <Crosshair className="w-4 h-4 text-slate-600" />
          Recenter Bus
        </button>
      )}

      {/* No GPS Fix Floating Notice */}
      {!hasValidFix && (
        <div className="absolute inset-0 z-[500] pointer-events-none flex items-center justify-center">
          <div className="px-4 py-3 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg text-center max-w-sm">
            <p className="text-sm font-semibold text-slate-800">Waiting for Bus Location</p>
            <p className="text-xs text-slate-500 mt-1">
              GPS coordinates have not yet been received from this vehicle. The map will automatically center once telemetry arrives.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
