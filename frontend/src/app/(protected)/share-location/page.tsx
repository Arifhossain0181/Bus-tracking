'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  Loader2,
  Radio,
  RefreshCw,
  Square,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { DriverLocationStatus } from '@/lib/types';
import {
  acquireGpsFix,
  shouldTransmitLocationUpdate,
  type GpsAcquisitionStatus,
  type GpsCoordinates,
} from '@/lib/trackingStatus';

const MiniLocationMap = dynamic(() => import('@/components/maps/MiniLocationMap'), {
  ssr: false,
  loading: () => <div className="h-64 rounded-xl bg-slate-200 animate-pulse" />,
});

export default function ShareLocationPage() {
  const [status, setStatus] = useState<DriverLocationStatus | null>(null);
  const [coords, setCoords] = useState<GpsCoordinates | null>(null);
  const [gpsState, setGpsState] = useState<GpsAcquisitionStatus>('idle');
  const [updateCount, setUpdateCount] = useState(0);
  const [lastSent, setLastSent] = useState<string>('--');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const watchRef = useRef<number | null>(null);
  const coordsRef = useRef<GpsCoordinates | null>(coords);
  coordsRef.current = coords;

  const inFlightRef = useRef(false);
  const lastSentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSentTimeRef = useRef<number>(0);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch<DriverLocationStatus>('/api/locations/location/status/');
      setStatus(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to check location status.');
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.is_sharing) {
      if (watchRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setCoords({
            lat: Number(pos.coords.latitude.toFixed(7)),
            lng: Number(pos.coords.longitude.toFixed(7)),
            accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
            speed: pos.coords.speed != null ? pos.coords.speed : null,
            heading: pos.coords.heading != null ? pos.coords.heading : null,
          });
        },
        (err) => {
          if (err.code === 1) {
            setError('Location permission denied during live tracking.');
          } else if (err.code === 2) {
            setError('GPS position unavailable. Please ensure location services are enabled.');
          } else {
            setError(`GPS watch error: ${err.message}`);
          }
        },
        { enableHighAccuracy: true }
      );
    }

    // Telemetry transmission loop (every 5 seconds)
    const timer = setInterval(async () => {
      if (inFlightRef.current) return;
      const c = coordsRef.current;
      if (!c) return;

      const decision = shouldTransmitLocationUpdate({
        lastSentCoords: lastSentCoordsRef.current,
        lastSentTimeMs: lastSentTimeRef.current,
        newCoords: c,
      });

      if (!decision.shouldSend) {
        return;
      }

      inFlightRef.current = true;
      try {
        await apiFetch('/api/locations/location/update/', {
          method: 'POST',
          body: JSON.stringify({
            latitude: c.lat,
            longitude: c.lng,
            accuracy: c.accuracy,
            speed: c.speed,
            heading: c.heading,
            timestamp: new Date().toISOString(),
          }),
        });
        lastSentCoordsRef.current = { lat: c.lat, lng: c.lng };
        lastSentTimeRef.current = Date.now();
        setUpdateCount((n) => n + 1);
        setLastSent(new Date().toLocaleTimeString());
      } catch {
        // ignore transient errors
      } finally {
        inFlightRef.current = false;
      }
    }, 5000);

    return () => {
      clearInterval(timer);
      if (watchRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [status?.is_sharing]);

  const startSharing = async () => {
    if (busy || status?.is_sharing) return;

    setError('');
    setBusy(true);
    setGpsState('acquiring');

    try {
      const fix = await acquireGpsFix();

      if (!fix.coords || isNaN(fix.coords.lat) || isNaN(fix.coords.lng)) {
        setGpsState(fix.status);
        setError(fix.errorMessage || 'Unable to obtain a verified GPS fix.');
        return;
      }

      setGpsState('acquired');
      setCoords(fix.coords);
      lastSentCoordsRef.current = { lat: fix.coords.lat, lng: fix.coords.lng };
      lastSentTimeRef.current = Date.now();

      await apiFetch('/api/locations/journey/start/', {
        method: 'POST',
        body: JSON.stringify({
          latitude: fix.coords.lat,
          longitude: fix.coords.lng,
          accuracy: fix.coords.accuracy,
          speed: fix.coords.speed,
          heading: fix.coords.heading,
        }),
      });

      setUpdateCount(1);
      setLastSent(new Date().toLocaleTimeString());
      await loadStatus();
    } catch (err) {
      setGpsState('error');
      setError(err instanceof ApiError ? err.message : 'Could not start location sharing.');
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await apiFetch('/api/locations/journey/end/', {
        method: 'POST',
        body: JSON.stringify(
          coords ? { latitude: coords.lat, longitude: coords.lng } : {}
        ),
      });
      setGpsState('idle');
      await loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop sharing.');
    } finally {
      setBusy(false);
    }
  };

  const isSharing = Boolean(status?.is_sharing);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live GPS Location Sharing</h1>
        <p className="text-sm text-slate-500">
          Broadcast your bus location accurately every 5 seconds so students and admins can track you live
        </p>
      </div>

      {/* GPS Status Alerts */}
      {gpsState === 'acquiring' && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
          <div>
            <p className="font-semibold">Acquiring verified GPS fix...</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Locking onto satellite signals (up to 12s). Accuracy must be within ±100m.
            </p>
          </div>
        </div>
      )}

      {gpsState === 'timeout' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">GPS Acquisition Timed Out</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Could not get a GPS fix within 12s. Move away from tall buildings or under clear sky and retry.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startSharing}
            disabled={busy}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry GPS
          </button>
        </div>
      )}

      {gpsState === 'poor_accuracy' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">Poor GPS Accuracy Detected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Current accuracy is {coords?.accuracy ? `±${coords.accuracy}m` : 'too low'}. Accuracy must be within ±100m to start journey.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startSharing}
            disabled={busy}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry GPS
          </button>
        </div>
      )}

      {gpsState === 'permission_denied' && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-semibold">Location Permission Denied</p>
            <p className="text-xs text-rose-700 mt-0.5">
              UBus requires location permissions to broadcast bus position. Please enable location permissions in browser settings.
            </p>
          </div>
        </div>
      )}

      {gpsState === 'position_unavailable' && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-semibold">GPS Position Unavailable</p>
              <p className="text-xs text-rose-700 mt-0.5">
                Your device could not determine a location. Please ensure GPS/Location Services are turned ON.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startSharing}
            disabled={busy}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry GPS
          </button>
        </div>
      )}

      {error && !['acquiring', 'timeout', 'poor_accuracy', 'permission_denied', 'position_unavailable'].includes(gpsState) && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${isSharing ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-slate-100 text-slate-400'
                }`}
            >
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900">
                {isSharing ? 'Broadcasting Live Location' : 'Location Sharing Inactive'}
              </p>
              <p className="text-xs text-slate-500">
                {status?.bus_number ? `Bus ${status.bus_number} · ${status.route_name}` : 'Ready when you start a journey'}
              </p>
            </div>
          </div>

          {!isSharing ? (
            <button
              type="button"
              disabled={busy}
              onClick={startSharing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm inline-flex items-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Acquiring GPS...
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  Start Location Sharing
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={stopSharing}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm inline-flex items-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  Stop Sharing
                </>
              )}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Latitude</div>
            <div className="font-mono text-sm font-bold text-slate-900 mt-0.5">
              {coords?.lat ?? '--'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Longitude</div>
            <div className="font-mono text-sm font-bold text-slate-900 mt-0.5">
              {coords?.lng ?? '--'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">GPS Accuracy</div>
            <div className="font-mono text-sm font-bold mt-0.5 flex items-center justify-center gap-1">
              {coords?.accuracy != null ? (
                <span className={coords.accuracy <= 30 ? 'text-emerald-700' : 'text-amber-700'}>
                  ±{coords.accuracy}m
                </span>
              ) : (
                <span className="text-slate-400">--</span>
              )}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Speed</div>
            <div className="font-bold text-sm text-slate-900 mt-0.5">
              {coords?.speed != null ? `${Math.round(coords.speed * 3.6)} km/h` : '--'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Updates Sent</div>
            <div className="font-bold text-sm text-emerald-700 mt-0.5">
              {updateCount} ({lastSent})
            </div>
          </div>
        </div>

        <MiniLocationMap latitude={coords?.lat ?? null} longitude={coords?.lng ?? null} />
      </div>
    </div>
  );
}
