'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  isValidCoordinate,
  calculateDistanceMeters,
  type FollowBusStatus,
} from '@/lib/trackingStatus';
import { Crosshair, Radio } from 'lucide-react';

interface Props {
  latitude: number | null;
  longitude: number | null;
  busNumber: string;
  trail: [number, number][];
  heightClass?: string;
  heading?: number | null;
  speed?: number | null;
  isAccurate?: boolean;
  status?: FollowBusStatus;
  nextStopName?: string | null;
  etaDisplay?: string | null;
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
  status = 'live',
  nextStopName = null,
  etaDisplay = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const initialCoordsRef = useRef({ lat: latitude, lng: longitude });
  const centeredOnceRef = useRef(false);
  const currentCoordsRef = useRef<[number, number] | null>(null);
  const targetCoordsRef = useRef<[number, number] | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number | null>(null);

  const [hasValidFix, setHasValidFix] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initial = isValidCoordinate(initialCoordsRef.current.lat, initialCoordsRef.current.lng)
      ? ([Number(initialCoordsRef.current.lat), Number(initialCoordsRef.current.lng)] as [number, number])
      : DEFAULT_CENTER;

    const map = L.map(containerRef.current, {
      zoomControl: true,
    }).setView(initial, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Pause auto-follow when user manually drags or zooms
    const handleUserInteraction = () => {
      setIsFollowing(false);
    };

    map.on('dragstart', handleUserInteraction);
    map.on('zoomstart', (e: L.LeafletEvent) => {
      // Only pause if triggered by user, not programmatic setView
      const mapInst = e.target as L.Map;
      if (mapInst.getZoom() !== undefined) {
        setIsFollowing(false);
      }
    });

    mapRef.current = map;

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      polylineRef.current = null;
      centeredOnceRef.current = false;
      currentCoordsRef.current = null;
      targetCoordsRef.current = null;
    };
  }, []);

  // Recenter / resume follow mode
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !isValidCoordinate(latitude, longitude)) return;
    setIsFollowing(true);
    map.setView([Number(latitude), Number(longitude)], 16, { animate: true });
  }, [latitude, longitude]);

  // Update Marker & Interpolate Movement
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasValidCoords = isValidCoordinate(latitude, longitude);
    setHasValidFix(hasValidCoords);

    if (!hasValidCoords || latitude == null || longitude == null) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        map.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
      currentCoordsRef.current = null;
      targetCoordsRef.current = null;
      return;
    }

    const targetLat = Number(latitude);
    const targetLng = Number(longitude);

    // Heading stabilization: suppress rapid compass jitter when stationary (< 1.5 km/h)
    const validHeading = typeof heading === 'number' && !isNaN(heading) && heading >= 0 && heading <= 360
      ? heading
      : null;
    if (speed != null && speed >= 0.4 && validHeading != null) {
      lastHeadingRef.current = validHeading;
    } else if (lastHeadingRef.current == null && validHeading != null) {
      lastHeadingRef.current = validHeading;
    }
    const displayHeading = lastHeadingRef.current;

    const headingArrowHtml =
      displayHeading != null
        ? `<div style="position:absolute;top:-6px;left:15px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid ${
            status === 'stale' ? '#d97706' : status === 'live' ? '#dc2626' : '#64748b'
          };transform:rotate(${displayHeading}deg);transform-origin:50% 27px;transition:transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);"></div>`
        : '';

    const speedLabel =
      typeof speed === 'number' && !isNaN(speed) && speed > 0
        ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${Math.round(speed * 3.6)} km/h</div>`
        : '';

    // Status-aware marker styling
    let markerBg = '#dc2626'; // Live red
    let markerBorder = '3px solid #ffffff';
    let pulseClass = status === 'live' ? 'bus-marker-pulse' : '';

    if (status === 'stale') {
      markerBg = '#d97706'; // Amber
      markerBorder = '3px dashed #fef3c7';
      pulseClass = '';
    } else if (status === 'offline' || status === 'journey_ended') {
      markerBg = '#64748b'; // Muted slate
      markerBorder = '3px solid #cbd5e1';
      pulseClass = '';
    }

    const iconHtml = `
      <div style="position:relative;width:44px;height:44px;">
        ${headingArrowHtml}
        <div class="${pulseClass}" style="width:44px;height:44px;border-radius:9999px;background:${markerBg};border:${markerBorder};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.35);">
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

    const etaSnippet = nextStopName
      ? `<div style="font-size:11px;color:#2563eb;margin-top:3px;font-weight:600;">Next: ${nextStopName}${
          etaDisplay ? ` (${etaDisplay})` : ''
        }</div>`
      : '';

    const popupHtml = `
      <div style="font-family:sans-serif;font-size:13px;line-height:1.4;min-width:140px;">
        <strong style="color:#0f172a;font-size:14px;">Bus ${busNumber}</strong>
        ${speedLabel}
        ${etaSnippet}
        ${!isAccurate ? '<div style="font-size:11px;color:#d97706;margin-top:4px;font-weight:600;">Low GPS Accuracy</div>' : ''}
        ${status === 'stale' ? '<div style="font-size:11px;color:#d97706;margin-top:2px;">Signal is Stale</div>' : ''}
        ${status === 'offline' ? '<div style="font-size:11px;color:#64748b;margin-top:2px;">Signal Offline</div>' : ''}
      </div>
    `;

    // Accuracy Circle visualization
    if (!isAccurate) {
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([targetLat, targetLng]);
      } else {
        accuracyCircleRef.current = L.circle([targetLat, targetLng], {
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

    // First time placement
    if (!currentCoordsRef.current) {
      currentCoordsRef.current = [targetLat, targetLng];
      targetCoordsRef.current = [targetLat, targetLng];

      markerRef.current = L.marker([targetLat, targetLng], { icon })
        .addTo(map)
        .bindPopup(popupHtml);

      if (!centeredOnceRef.current) {
        map.setView([targetLat, targetLng], 15, { animate: true });
        centeredOnceRef.current = true;
      }
      return;
    }

    // Existing marker update
    if (markerRef.current) {
      markerRef.current.setIcon(icon);
      markerRef.current.setPopupContent(popupHtml);
    }

    const prevPos = currentCoordsRef.current;
    const distanceMeters = calculateDistanceMeters(prevPos[0], prevPos[1], targetLat, targetLng);

    // Case 1: Insignificant movement (< 2 meters) — suppress jitter when stationary
    if (distanceMeters < 2.0) {
      targetCoordsRef.current = [targetLat, targetLng];
      return;
    }

    // Case 2: Implausible jump (> 1000m) or stale/offline telemetry — snap immediately without awkward glide
    if (distanceMeters > 1000.0 || status !== 'live') {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      currentCoordsRef.current = [targetLat, targetLng];
      targetCoordsRef.current = [targetLat, targetLng];
      markerRef.current?.setLatLng([targetLat, targetLng]);
      accuracyCircleRef.current?.setLatLng([targetLat, targetLng]);

      if (isFollowing) {
        map.panTo([targetLat, targetLng], { animate: true, duration: 0.8 });
      }
      return;
    }

    // Case 3: Live movement (2m <= dist <= 1000m) — smooth 60fps interpolation over 1.0s
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    const startLat = currentCoordsRef.current[0];
    const startLng = currentCoordsRef.current[1];
    const startTime = performance.now();
    const durationMs = 1000; // Complete ahead of next 3s poll

    targetCoordsRef.current = [targetLat, targetLng];

    const animateMarker = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease-out quad
      const ease = 1 - (1 - progress) * (1 - progress);

      const curLat = startLat + (targetLat - startLat) * ease;
      const curLng = startLng + (targetLng - startLng) * ease;
      currentCoordsRef.current = [curLat, curLng];

      markerRef.current?.setLatLng([curLat, curLng]);
      accuracyCircleRef.current?.setLatLng([curLat, curLng]);

      if (progress < 1) {
        animFrameIdRef.current = requestAnimationFrame(animateMarker);
      } else {
        currentCoordsRef.current = [targetLat, targetLng];
        animFrameIdRef.current = null;
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animateMarker);

    if (isFollowing) {
      map.panTo([targetLat, targetLng], { animate: true, duration: 0.8 });
    }
  }, [latitude, longitude, busNumber, heading, speed, isAccurate, status, nextStopName, etaDisplay, isFollowing]);

  // Update Breadcrumb Polyline in-place
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Filter valid coordinates in trail, skipping unrealistic gaps (> 2500m)
    const validPoints: [number, number][] = [];
    for (const [tLat, tLng] of trail) {
      if (isValidCoordinate(tLat, tLng)) {
        const last = validPoints[validPoints.length - 1];
        if (!last || calculateDistanceMeters(last[0], last[1], tLat, tLng) <= 2500) {
          validPoints.push([tLat, tLng]);
        }
      }
    }

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(validPoints);
    } else if (validPoints.length >= 2) {
      polylineRef.current = L.polyline(validPoints, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.75,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
    }
  }, [trail]);

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm ${heightClass}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Recenter & Follow Controls (safe from Leaflet attribution overlap) */}
      {hasValidFix && (
        <div className="absolute bottom-7 right-3 z-[500] flex flex-col items-end gap-2">
          <button
            onClick={handleRecenter}
            title={isFollowing ? 'Tracking bus (Click to re-focus)' : 'Recenter Map on Bus'}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg shadow-md text-xs font-semibold backdrop-blur-sm transition-all min-h-[44px] ${
              isFollowing
                ? 'bg-white/95 border border-emerald-300 text-emerald-800'
                : 'bg-white/95 border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {isFollowing ? (
              <>
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>Auto-Following</span>
              </>
            ) : (
              <>
                <Crosshair className="w-4 h-4 text-blue-600" />
                <span>Recenter Bus (Paused)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* No GPS Fix Floating Notice */}
      {!hasValidFix && (
        <div className="absolute inset-0 z-[500] pointer-events-none flex items-center justify-center p-4">
          <div className="px-5 py-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg text-center max-w-sm">
            <p className="text-sm font-semibold text-slate-800">Waiting for Bus Location</p>
            <p className="text-xs text-slate-500 mt-1">
              GPS telemetry has not yet been received from this vehicle. The map will automatically center once data arrives.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
