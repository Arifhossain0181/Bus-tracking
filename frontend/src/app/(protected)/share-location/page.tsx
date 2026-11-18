'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Radio, Square } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { DriverLocationStatus } from '@/lib/types';

const MiniLocationMap = dynamic(() => import('@/components/maps/MiniLocationMap'), {
  ssr: false,
  loading: () => <div className="h-64 rounded-xl bg-slate-200 animate-pulse" />,
});

export default function ShareLocationPage() {
  const [status, setStatus] = useState<DriverLocationStatus | null>(null);
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  } | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastSent, setLastSent] = useState<string>('--');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const watchRef = useRef<number | null>(null);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

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
            accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          });
        },
        (err) => setError(`GPS error: ${err.message}`),
        { enableHighAccuracy: true }
      );
    }

    const timer = setInterval(async () => {
      const c = coordsRef.current;
      if (!c) return;
      try {
        await apiFetch('/api/locations/location/update/', {
          method: 'POST',
          body: JSON.stringify({
            latitude: c.lat,
            longitude: c.lng,
            accuracy: c.accuracy,
            speed: c.speed,
            heading: c.heading,
          }),
        });
        setUpdateCount((n) => n + 1);
        setLastSent(new Date().toLocaleTimeString());
      } catch {
        // ignore transient errors
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
    setError('');
    setBusy(true);
    try {
      const initial = await new Promise<{ latitude: number; longitude: number }>((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          resolve({ latitude: 23.8103, longitude: 90.4125 });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: Number(pos.coords.latitude.toFixed(7)),
              longitude: Number(pos.coords.longitude.toFixed(7)),
            }),
          () => resolve({ latitude: 23.8103, longitude: 90.4125 }),
          { enableHighAccuracy: true, timeout: 6000 }
        );
      });
      setCoords({
        lat: initial.latitude,
        lng: initial.longitude,
        accuracy: null,
        speed: null,
        heading: null,
      });
      await apiFetch('/api/locations/journey/start/', {
        method: 'POST',
        body: JSON.stringify(initial),
      });
      await loadStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start sharing.');
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    setError('');
    setBusy(true);
    try {
      await apiFetch('/api/locations/journey/end/', {
        method: 'POST',
        body: JSON.stringify(
          coords ? { latitude: coords.lat, longitude: coords.lng } : {}
        ),
      });
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
          Broadcast your bus location every 5 seconds so students and admins can track you live
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isSharing ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-slate-100 text-slate-400'
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
              <Radio className="w-4 h-4" />
              {busy ? 'Starting...' : 'Start Location Sharing'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={stopSharing}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm inline-flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              {busy ? 'Stopping...' : 'Stop Sharing'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
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
