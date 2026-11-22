'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Map,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { RouteItem, Stop } from '@/lib/types';
import type { RoadRouteResponse } from '@/lib/routeGeometry';

const StopLocationPickerModal = dynamic(
  () => import('@/components/maps/StopLocationPickerModal'),
  { ssr: false }
);

const RouteMapView = dynamic(() => import('@/components/maps/RouteMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-80 sm:h-96 rounded-xl bg-slate-100 animate-pulse border border-slate-200 flex items-center justify-center text-xs text-slate-400">
      Loading map...
    </div>
  ),
});

interface TripDraft {
  id?: number;
  trip_number: number;
  name: string;
  departure_time: string;
  arrival_time: string;
}

interface StopDraft {
  id?: number;
  name: string;
  scheduled_time: string;
  latitude: string;
  longitude: string;
  is_major_stop: boolean;
}

const ALL_DAYS = [
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
];

export function RouteBuilderForm({ existing }: { existing?: RouteItem }) {
  const router = useRouter();
  const [routeType, setRouteType] = useState<'shuttle' | 'metro' | 'long'>(existing?.route_type || 'shuttle');
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [color, setColor] = useState(existing?.color || '#2563eb');
  const [serviceDays, setServiceDays] = useState(existing?.service_days || 'sat-thu');
  const [customDays, setCustomDays] = useState<string[]>(
    existing?.custom_days ? existing.custom_days.split(',').map((s) => s.trim()).filter(Boolean) : ['sat', 'sun', 'mon', 'tue', 'wed', 'thu']
  );
  const [originName, setOriginName] = useState(existing?.origin_name || 'Campus');
  const [destinationName, setDestinationName] = useState(existing?.destination_name || '');
  const [durationMins, setDurationMins] = useState<string>(
    existing?.estimated_duration_mins ? String(existing.estimated_duration_mins) : ''
  );
  const [isPublished, setIsPublished] = useState<boolean>(existing?.is_published ?? true);

  const [trips, setTrips] = useState<TripDraft[]>(
    existing?.trips?.length
      ? existing.trips.map((t, i) => ({
          id: t.id,
          trip_number: t.trip_number || i + 1,
          name: t.name,
          departure_time: t.departure_time.slice(0, 5),
          arrival_time: t.arrival_time ? t.arrival_time.slice(0, 5) : '',
        }))
      : [{ trip_number: 1, name: 'Trip 01', departure_time: '08:00', arrival_time: '08:30' }]
  );

  const [pickerStopIndex, setPickerStopIndex] = useState<number | null>(null);

  const [stops, setStops] = useState<StopDraft[]>(
    existing?.stops?.length
      ? existing.stops.map((s) => ({
          id: s.id,
          name: s.name,
          scheduled_time: s.scheduled_time ? s.scheduled_time.slice(0, 5) : '',
          latitude: s.latitude != null ? String(s.latitude) : '',
          longitude: s.longitude != null ? String(s.longitude) : '',
          is_major_stop: s.is_major_stop,
        }))
      : [{ name: '', scheduled_time: '07:30', latitude: '', longitude: '', is_major_stop: false }]
  );

  const [roadRouteData, setRoadRouteData] = useState<RoadRouteResponse | null>(
    existing?.active_geometry
      ? {
          route_id: existing.id,
          route_name: existing.name,
          geometry: existing.active_geometry,
          distance_km: Number(existing.total_distance_km) || 0,
          duration_mins: Number(existing.estimated_duration_mins) || 0,
          coordinate_count: existing.active_geometry.coordinates.length,
          waypoints_snapped: [],
          provider: 'valhalla',
          warnings: [],
          metadata: {},
        }
      : null
  );
  const [generatingRoute, setGeneratingRoute] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  const mapStops: Stop[] = useMemo(() => {
    return stops
      .filter(
        (s) =>
          s.latitude &&
          s.longitude &&
          !Number.isNaN(Number(s.latitude)) &&
          !Number.isNaN(Number(s.longitude))
      )
      .map((s, idx) => ({
        id: s.id || idx + 1,
        route: existing?.id,
        name: s.name || `Pickup #${idx + 1}`,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        order: idx + 1,
        scheduled_time: s.scheduled_time || '',
        average_wait_time: 2,
        is_major_stop: s.is_major_stop,
      }));
  }, [stops, existing?.id]);

  const handleGenerateRoadRoute = async () => {
    if (mapStops.length < 2) {
      setRoutingError('Please add at least 2 pickup points with map locations to generate a road route.');
      return;
    }

    setGeneratingRoute(true);
    setRoutingError(null);

    try {
      const endpoint = existing?.id
        ? `/api/schedules/routes/${existing.id}/generate-geometry/`
        : `/api/schedules/routes/generate-geometry/`;

      const waypoints = mapStops.map((s) => ({
        lat: Number(s.latitude),
        lng: Number(s.longitude),
      }));

      const res = await apiFetch<RoadRouteResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          waypoints,
          profile: 'bus',
        }),
      });

      setRoadRouteData(res);
      if (!durationMins && res.duration_mins) {
        setDurationMins(String(res.duration_mins));
      }
    } catch (err) {
      setRoutingError(err instanceof ApiError ? err.message : 'Failed to generate road route.');
    } finally {
      setGeneratingRoute(false);
    }
  };

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleCustomDay = (day: string) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addTrip = () => {
    setTrips((prev) => [
      ...prev,
      {
        trip_number: prev.length + 1,
        name: `Trip ${String(prev.length + 1).padStart(2, '0')}`,
        departure_time: '',
        arrival_time: '',
      },
    ]);
  };

  const removeTrip = (idx: number) => {
    if (trips.length <= 1) return;
    setTrips((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((t, i) => ({ ...t, trip_number: i + 1, name: `Trip ${String(i + 1).padStart(2, '0')}` }))
    );
  };

  const addStop = () => {
    setStops((prev) => [
      ...prev,
      { name: '', scheduled_time: '', latitude: '', longitude: '', is_major_stop: false },
    ]);
  };

  const handleSaveStopLocation = (lat: number, lng: number) => {
    if (pickerStopIndex === null) return;
    setStops((prev) =>
      prev.map((item, i) =>
        i === pickerStopIndex
          ? { ...item, latitude: String(lat), longitude: String(lng) }
          : item
      )
    );
  };

  const handleClearStopLocation = (idx?: number) => {
    const targetIdx = idx !== undefined ? idx : pickerStopIndex;
    if (targetIdx === null || targetIdx === undefined) return;
    setStops((prev) =>
      prev.map((item, i) =>
        i === targetIdx ? { ...item, latitude: '', longitude: '' } : item
      )
    );
  };

  const moveStop = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stops.length) return;
    const copy = [...stops];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setStops(copy);
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 1) return;
    setStops((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Route name is required.');
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      route_type: routeType,
      color,
      service_days: serviceDays,
      custom_days: serviceDays === 'custom' ? customDays.join(',') : '',
      origin_name: routeType === 'long' ? '' : originName.trim(),
      destination_name: destinationName.trim(),
      estimated_duration_mins: durationMins ? Number(durationMins) : null,
      is_published: isPublished,
    };

    if (routeType === 'long') {
      const validStops = stops.filter((s) => s.name.trim());
      if (validStops.length === 0) {
        setError('Please add at least one pickup point.');
        return;
      }
      payload.stops = validStops.map((s, idx) => ({
        id: s.id,
        name: s.name.trim(),
        scheduled_time: s.scheduled_time || null,
        latitude: s.latitude ? Number(s.latitude) : 23.8103,
        longitude: s.longitude ? Number(s.longitude) : 90.4125,
        order: idx + 1,
        is_major_stop: s.is_major_stop,
      }));
    } else {
      const validTrips = trips.filter((t) => t.departure_time);
      if (validTrips.length === 0) {
        setError('Please add at least one trip with a departure time.');
        return;
      }
      payload.trips = validTrips.map((t, idx) => ({
        id: t.id,
        trip_number: idx + 1,
        name: t.name || `Trip ${String(idx + 1).padStart(2, '0')}`,
        departure_time: t.departure_time,
        arrival_time: t.arrival_time || null,
      }));
    }

    if (roadRouteData) {
      payload.geometry = roadRouteData.geometry;
      payload.total_distance_km = roadRouteData.distance_km;
      if (!durationMins && roadRouteData.duration_mins) {
        payload.estimated_duration_mins = roadRouteData.duration_mins;
      }
      payload.metadata = {
        mode: 'road_route',
        provider: roadRouteData.provider,
        shaping_points: mapStops.map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude) })),
      };
    }

    setSaving(true);
    try {
      if (existing) {
        await apiFetch(`/api/schedules/routes/${existing.id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        router.push(`/routes/${existing.id}`);
      } else {
        const created = await apiFetch<RouteItem>('/api/schedules/routes/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        router.push(`/routes/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save route.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Route Type */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900">1. Select Route Type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              { key: 'shuttle', title: 'Shuttle Bus', desc: 'Frequent campus shuttle with numbered trips' },
              { key: 'metro', title: 'Metro Bus', desc: 'Metro station connector with fixed trip timetable' },
              { key: 'long', title: 'Long Road Bus', desc: 'City route with ordered pickup stops & times' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRouteType(opt.key)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                routeType === opt.key
                  ? 'border-blue-600 bg-blue-50/70'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm text-slate-900">{opt.title}</div>
              <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900">2. Route Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Route Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Uttara Shuttle / Mirpur Long Route"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Service Days</label>
            <select
              value={serviceDays}
              onChange={(e) => setServiceDays(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="sat-thu">Saturday - Thursday</option>
              <option value="sun-thu">Sunday - Thursday</option>
              <option value="mon-fri">Monday - Friday</option>
              <option value="all">All Days</option>
              <option value="custom">Custom Days</option>
            </select>
          </div>

          {serviceDays === 'custom' && (
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {ALL_DAYS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleCustomDay(d.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    customDays.includes(d.key)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {routeType !== 'long' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Origin Name</label>
              <input
                type="text"
                value={originName}
                onChange={(e) => setOriginName(e.target.value)}
                placeholder="e.g., Campus"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {routeType === 'long' ? 'Final Destination' : 'Destination Name'}
            </label>
            <input
              type="text"
              value={destinationName}
              onChange={(e) => setDestinationName(e.target.value)}
              placeholder="e.g., Azampur / Campus"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Estimated Duration (mins)
            </label>
            <input
              type="number"
              min={1}
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
              placeholder="e.g., 45"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div className="flex items-center gap-4 pt-5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Color:</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded border border-slate-300 cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="rounded border-slate-300"
              />
              Published (visible to users)
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this route..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Step 3: Trips or Pickup Points */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">
            {routeType === 'long' ? '3. Ordered Pickup Points' : '3. Trip Timetable'}
          </h2>
          <button
            type="button"
            onClick={routeType === 'long' ? addStop : addTrip}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {routeType === 'long' ? 'Add Pickup Point' : 'Add Trip'}
          </button>
        </div>

        {routeType === 'long' ? (
          <div className="space-y-2.5">
            {stops.map((s, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center p-3 rounded-lg bg-slate-50 border border-slate-200"
              >
                <div className="md:col-span-1 font-bold text-xs text-slate-500">#{idx + 1}</div>
                <div className="md:col-span-4">
                  <input
                    type="text"
                    required
                    placeholder="Pickup point name"
                    value={s.name}
                    onChange={(e) =>
                      setStops((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    type="time"
                    value={s.scheduled_time}
                    onChange={(e) =>
                      setStops((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, scheduled_time: e.target.value } : item
                        )
                      )
                    }
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="md:col-span-3 flex items-center">
                  {s.latitude && s.longitude ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <button
                        type="button"
                        onClick={() => setPickerStopIndex(idx)}
                        className="flex-1 inline-flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 transition-colors"
                        title={`Location on map: ${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}`}
                      >
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate">Location Set</span>
                        </span>
                        <span className="text-[10px] text-emerald-700 underline shrink-0 ml-1">Change</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearStopLocation(idx)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Clear map location"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerStopIndex(idx)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-slate-600 text-xs font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Pick on Map (Optional)</span>
                    </button>
                  )}
                </div>
                <div className="md:col-span-2 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => moveStop(idx, -1)}
                    className="p-1.5 rounded bg-white border border-slate-300 hover:bg-slate-100"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStop(idx, 1)}
                    className="p-1.5 rounded bg-white border border-slate-300 hover:bg-slate-100"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStop(idx)}
                    disabled={stops.length <= 1}
                    className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {trips.map((t, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-3 rounded-lg bg-slate-50 border border-slate-200"
              >
                <div className="sm:col-span-3 font-semibold text-sm text-slate-800">
                  Trip {String(idx + 1).padStart(2, '0')}
                </div>
                <div className="sm:col-span-4">
                  <label className="text-[11px] text-slate-500 block">Departure *</label>
                  <input
                    type="time"
                    required
                    value={t.departure_time}
                    onChange={(e) =>
                      setTrips((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, departure_time: e.target.value } : item
                        )
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="text-[11px] text-slate-500 block">Arrival (Optional)</label>
                  <input
                    type="time"
                    value={t.arrival_time}
                    onChange={(e) =>
                      setTrips((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, arrival_time: e.target.value } : item
                        )
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeTrip(idx)}
                    disabled={trips.length <= 1}
                    className="p-2 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 4: Integrated Route Map & Road Path Preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <Map className="w-5 h-5 text-blue-600" />
              <span>4. Route Map & Road Path Preview</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live map preview following roads in Dhaka based on your pickup stops
            </p>
          </div>
          {mapStops.length >= 2 && (
            <button
              type="button"
              onClick={handleGenerateRoadRoute}
              disabled={generatingRoute}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {generatingRoute ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculating Road Route...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Generate Road Route</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Status / Feedback Banner */}
        {roadRouteData ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Road-following route active:</strong> {roadRouteData.distance_km} km &middot; ~{roadRouteData.duration_mins} mins ({roadRouteData.coordinate_count} road curve points via {roadRouteData.provider.toUpperCase()})
              </span>
            </div>
            {roadRouteData.duration_mins && (
              <button
                type="button"
                onClick={() => setDurationMins(String(roadRouteData.duration_mins))}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
              >
                Apply Duration ({roadRouteData.duration_mins} mins)
              </button>
            )}
          </div>
        ) : routingError ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{routingError}</span>
          </div>
        ) : mapStops.length >= 2 ? (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center justify-between">
            <span>
              {mapStops.length} stops located on map. Click <strong>&quot;Generate Road Route&quot;</strong> to calculate the road-following bus path along Dhaka streets.
            </span>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
            Add at least 2 pickup points with map locations in Step 3 above to preview the road-following bus route.
          </div>
        )}

        {/* Map View */}
        <RouteMapView
          stops={mapStops}
          color={color}
          activeGeometry={roadRouteData?.geometry || existing?.active_geometry || existing?.active_revision?.geometry}
          heightClass="h-80 sm:h-96"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm"
        >
          {saving ? 'Saving...' : existing ? 'Update Route' : 'Create Route'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      {pickerStopIndex !== null && stops[pickerStopIndex] && (
        <StopLocationPickerModal
          isOpen={pickerStopIndex !== null}
          stopName={stops[pickerStopIndex].name}
          stopOrder={pickerStopIndex + 1}
          initialLat={stops[pickerStopIndex].latitude ? Number(stops[pickerStopIndex].latitude) : null}
          initialLng={stops[pickerStopIndex].longitude ? Number(stops[pickerStopIndex].longitude) : null}
          onSave={handleSaveStopLocation}
          onClear={() => handleClearStopLocation()}
          onClose={() => setPickerStopIndex(null)}
        />
      )}
    </form>
  );
}
