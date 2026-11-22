'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Loader2,
  Map,
  MapPin,
  Plus,
  PlusCircle,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { RouteItem, RouteRevision, Stop } from '@/lib/types';
import {
  EditorPoint,
  GeoJsonLineString,
  fromGeoJsonLineString,
  toGeoJsonLineString,
  calculatePathDistanceKm,
  estimateDurationMinutes,
  validateRouteGeometry,
  RoadRouteResponse,
  RoadRouteCandidate,
  computeWaypointsFingerprint,
  movePoint,
  calculateDistanceDelta,
  calculateMaxSnapDisplacement,
  resolveDraftSavePlan,
} from '@/lib/routeGeometry';

const StopLocationPickerModal = dynamic(
  () => import('@/components/maps/StopLocationPickerModal'),
  { ssr: false }
);

const VisualRouteEditorMap = dynamic(
  () => import('@/components/maps/VisualRouteEditorMap'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] rounded-xl bg-slate-100 animate-pulse border border-slate-200 flex items-center justify-center text-xs text-slate-400">
        Loading Route Editor Map...
      </div>
    ),
  }
);

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

  // Route Configuration State
  const [routeType, setRouteType] = useState<'shuttle' | 'metro' | 'long'>(existing?.route_type || 'shuttle');
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [color, setColor] = useState(existing?.color || '#2563eb');
  const [serviceDays, setServiceDays] = useState(existing?.service_days || 'sat-thu');
  const [customDays, setCustomDays] = useState<string[]>(
    existing?.custom_days
      ? existing.custom_days.split(',').map((s) => s.trim()).filter(Boolean)
      : ['sat', 'sun', 'mon', 'tue', 'wed', 'thu']
  );
  const [originName, setOriginName] = useState(existing?.origin_name || 'Campus');
  const [destinationName, setDestinationName] = useState(existing?.destination_name || '');
  const [durationMins, setDurationMins] = useState<string>(
    existing?.estimated_duration_mins ? String(existing.estimated_duration_mins) : ''
  );
  const [isPublished, setIsPublished] = useState<boolean>(existing?.is_published ?? true);

  // Trips & Stops State
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

  // Revisions State (for existing routes)
  const [revisions, setRevisions] = useState<RouteRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | 'new' | null>(null);
  const [changeSummary, setChangeSummary] = useState('');

  // Visual Route Editor (Shaping Points & Interactive Editing)
  const [points, setPoints] = useState<EditorPoint[]>(() => {
    const meta = existing?.metadata as Record<string, unknown> | undefined;
    if (meta && Array.isArray(meta.shaping_points) && meta.shaping_points.length >= 2) {
      return (meta.shaping_points as Array<{ lat: number; lng: number }>).map((p, idx) => ({
        id: `pt_${idx}_${Date.now()}`,
        lat: Number(p.lat),
        lng: Number(p.lng),
      }));
    }
    if (existing?.active_geometry) {
      return fromGeoJsonLineString(existing.active_geometry);
    }
    return [];
  });
  const [history, setHistory] = useState<EditorPoint[][]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<'points' | 'stops' | 'revision'>('points');

  // Road Routing Candidate & Accepted State
  const [candidateRoute, setCandidateRoute] = useState<RoadRouteCandidate | null>(null);
  const [generatingRoute, setGeneratingRoute] = useState(false);
  const [acceptedRoadGeometry, setAcceptedRoadGeometry] = useState<GeoJsonLineString | null>(
    existing?.active_geometry || null
  );
  const [acceptedRoadMetrics, setAcceptedRoadMetrics] = useState<{
    distanceKm: number;
    durationMins: number;
    metadata: Record<string, unknown>;
  } | null>(
    existing?.active_geometry
      ? {
          distanceKm: Number(existing.total_distance_km) || 0,
          durationMins: Number(existing.estimated_duration_mins) || 0,
          metadata: (existing.metadata || {}) as Record<string, unknown>,
        }
      : null
  );
  const [acceptedFingerprint, setAcceptedFingerprint] = useState<string | null>(() => {
    if (existing?.active_geometry) {
      const meta = existing.metadata as Record<string, unknown> | undefined;
      if (meta && Array.isArray(meta.shaping_points) && meta.shaping_points.length >= 2) {
        return computeWaypointsFingerprint(meta.shaping_points as Array<{ lat: number; lng: number }>);
      }
      return computeWaypointsFingerprint(fromGeoJsonLineString(existing.active_geometry));
    }
    return null;
  });

  // Async stale response protection refs
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const generationRequestFpRef = useRef<string | null>(null);

  // Status & Notifications
  const [error, setError] = useState<string | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Map Passenger Stops derived from form stops state
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

  // Load Revisions for existing route
  useEffect(() => {
    if (!existing?.id) return;
    apiFetch<RouteRevision[]>(`/api/schedules/routes/${existing.id}/revisions/`)
      .then((revs) => {
        setRevisions(revs);
        if (revs.length > 0) {
          const draftRev = revs.find((r) => r.status === 'draft');
          const activeRev = existing.active_revision
            ? revs.find((r) => r.id === existing.active_revision?.id)
            : null;
          const target = draftRev || activeRev || revs[0];
          setSelectedRevisionId(target.id);
          setChangeSummary(target.change_summary || '');
        }
      })
      .catch(() => setRevisions([]));
  }, [existing?.id, existing?.active_revision]);

  // Apply a Revision to the Editor State
  const applyRevisionToEditor = useCallback((rev: RouteRevision) => {
    setCandidateRoute(null);
    setInsertAfterIndex(null);
    const meta = (rev.metadata || {}) as Record<string, unknown>;
    const isRoadRoute = meta.mode === 'road_route';
    const revGeo = rev.geometry as GeoJsonLineString | null;

    if (isRoadRoute && revGeo) {
      setAcceptedRoadGeometry(revGeo);
      setAcceptedRoadMetrics({
        distanceKm: Number(rev.distance_km || 0),
        durationMins: Number(rev.duration_mins || 0),
        metadata: meta,
      });

      if (Array.isArray(meta.shaping_points) && meta.shaping_points.length >= 2) {
        const shapingPts = (meta.shaping_points as Array<{ lat: number; lng: number }>).map((p, idx) => ({
          id: `pt_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          lat: Number(p.lat),
          lng: Number(p.lng),
        }));
        setPoints(shapingPts);
        setAcceptedFingerprint(computeWaypointsFingerprint(shapingPts));
      } else {
        const pts = fromGeoJsonLineString(revGeo);
        setPoints(pts);
        setAcceptedFingerprint(computeWaypointsFingerprint(pts));
      }
    } else {
      setAcceptedRoadGeometry(null);
      setAcceptedRoadMetrics(null);
      setAcceptedFingerprint(null);
      setPoints(fromGeoJsonLineString(rev.geometry as GeoJsonLineString));
    }
  }, []);

  const handleSelectRevision = (val: string) => {
    setError(null);
    setSuccessMsg(null);
    setCandidateRoute(null);
    setInsertAfterIndex(null);

    if (val === 'new') {
      setSelectedRevisionId('new');
      setChangeSummary('');
      return;
    }

    const revId = Number(val);
    const rev = revisions.find((r) => r.id === revId);
    if (rev) {
      setSelectedRevisionId(revId);
      applyRevisionToEditor(rev);
      setChangeSummary(rev.change_summary || '');
    }
  };

  // Validation & Metrics
  const validation = useMemo(() => validateRouteGeometry(points), [points]);
  const distanceKm = useMemo(() => calculatePathDistanceKm(points), [points]);
  const schematicDurationMins = useMemo(() => estimateDurationMinutes(distanceKm), [distanceKm]);

  // Check if shaping points have been modified since current road route was accepted
  const isWaypointsRefined = useMemo(() => {
    if (!acceptedRoadGeometry) return false;
    if (!acceptedFingerprint || !acceptedFingerprint.trim()) return true;
    return computeWaypointsFingerprint(points) !== acceptedFingerprint;
  }, [acceptedRoadGeometry, acceptedFingerprint, points]);

  // Points modification helper with history stack and stale candidate invalidation
  const updatePointsWithHistory = useCallback(
    (nextPoints: EditorPoint[]) => {
      setHistory((prev) => [...prev.slice(-25), points]);
      setPoints(nextPoints);
      setError(null);
      setRoutingError(null);

      const currentFp = computeWaypointsFingerprint(points);
      const nextFp = computeWaypointsFingerprint(nextPoints);
      if (currentFp !== nextFp && candidateRoute) {
        setCandidateRoute(null);
        setRoutingError('Candidate road route preview was cleared because shaping waypoints changed.');
      }

      if (insertAfterIndex !== null && insertAfterIndex >= nextPoints.length) {
        setInsertAfterIndex(null);
      }
    },
    [points, candidateRoute, insertAfterIndex]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setPoints(previous);
    setSelectedPointIndex(null);
    setInsertAfterIndex(null);

    const currentFp = computeWaypointsFingerprint(points);
    const prevFp = computeWaypointsFingerprint(previous);
    if (currentFp !== prevFp && candidateRoute) {
      setCandidateRoute(null);
    }
  }, [history, points, candidateRoute]);

  const handleDeleteSelectedPoint = useCallback(() => {
    if (selectedPointIndex === null || selectedPointIndex < 0 || selectedPointIndex >= points.length) return;
    const updated = points.filter((_, idx) => idx !== selectedPointIndex);
    updatePointsWithHistory(updated);
    setSelectedPointIndex(null);
    setInsertAfterIndex(null);
  }, [selectedPointIndex, points, updatePointsWithHistory]);

  const handleMovePointUp = useCallback(
    (idx: number) => {
      if (idx <= 0 || idx >= points.length) return;
      const updated = movePoint(points, idx, idx - 1);
      updatePointsWithHistory(updated);
      setSelectedPointIndex(idx - 1);
      if (insertAfterIndex === idx) setInsertAfterIndex(idx - 1);
      else if (insertAfterIndex === idx - 1) setInsertAfterIndex(idx);
    },
    [points, insertAfterIndex, updatePointsWithHistory]
  );

  const handleMovePointDown = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= points.length - 1) return;
      const updated = movePoint(points, idx, idx + 1);
      updatePointsWithHistory(updated);
      setSelectedPointIndex(idx + 1);
      if (insertAfterIndex === idx) setInsertAfterIndex(idx + 1);
      else if (insertAfterIndex === idx + 1) setInsertAfterIndex(idx);
    },
    [points, insertAfterIndex, updatePointsWithHistory]
  );

  const handleToggleInsertAfter = useCallback((idx: number) => {
    setInsertAfterIndex((prev) => (prev === idx ? null : idx));
    setSelectedPointIndex(idx);
  }, []);

  const handleClearAllPoints = useCallback(() => {
    if (points.length === 0) return;
    if (!window.confirm('Clear all shaping points from the map?')) return;
    updatePointsWithHistory([]);
    setSelectedPointIndex(null);
    setInsertAfterIndex(null);
  }, [points.length, updatePointsWithHistory]);

  // Sync shaping points directly from Step 3 stops with map locations
  const handleSyncPointsFromStops = () => {
    if (mapStops.length === 0) {
      setRoutingError('No pickup points with map locations found in Step 3 to sync.');
      return;
    }
    const synced: EditorPoint[] = mapStops.map((s, idx) => ({
      id: `pt_stop_${s.id}_${idx}_${Date.now()}`,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
    }));
    updatePointsWithHistory(synced);
    setSuccessMsg(`Synced ${synced.length} shaping waypoints from pickup stops.`);
  };

  // Generate / Regenerate Road Route Preview
  const handleGenerateRoadRoute = async () => {
    // If shaping points are empty but stops are available, auto-sync
    let activePoints = points;
    if (activePoints.length < 2 && mapStops.length >= 2) {
      activePoints = mapStops.map((s, idx) => ({
        id: `pt_stop_${s.id}_${idx}_${Date.now()}`,
        lat: Number(s.latitude),
        lng: Number(s.longitude),
      }));
      updatePointsWithHistory(activePoints);
    }

    if (activePoints.length < 2) {
      setRoutingError('Please add at least 2 points on the map or 2 pickup points with locations to generate a road route.');
      return;
    }

    const val = validateRouteGeometry(activePoints);
    if (!val.isValid) {
      setRoutingError(val.error || 'Please correct invalid shaping points before generating road route.');
      return;
    }

    const requestFp = computeWaypointsFingerprint(activePoints);
    generationRequestFpRef.current = requestFp;

    setGeneratingRoute(true);
    setRoutingError(null);
    setSuccessMsg(null);

    try {
      const endpoint = existing?.id
        ? `/api/schedules/routes/${existing.id}/generate-geometry/`
        : `/api/schedules/routes/generate-geometry/`;

      const waypoints = activePoints.map((p) => ({ lat: p.lat, lng: p.lng }));

      const res = await apiFetch<RoadRouteResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ waypoints, profile: 'bus' }),
      });

      // Async Stale Response Protection: verify waypoints did not change while request was in-flight
      const currentLiveFp = computeWaypointsFingerprint(pointsRef.current);
      if (currentLiveFp !== requestFp) {
        console.warn('Discarding stale routing response: shaping points were modified while generation was in-flight.');
        return;
      }

      const candidate: RoadRouteCandidate = {
        geometry: res.geometry,
        distanceKm: res.distance_km,
        durationMins: res.duration_mins,
        coordinateCount: res.coordinate_count,
        waypointsSnapped: res.waypoints_snapped || [],
        provider: res.provider,
        warnings: res.warnings || [],
        metadata: res.metadata || {},
        fingerprint: requestFp,
      };

      setCandidateRoute(candidate);
      setSuccessMsg(
        `Generated road route candidate via ${res.provider.toUpperCase()} (${res.distance_km} km, ${res.coordinate_count} coordinates). Review on map and click "Accept Road Route".`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to generate road route';
      setRoutingError(`Road routing failed: ${msg}. Your shaping points and any previously accepted route are preserved.`);
    } finally {
      setGeneratingRoute(false);
    }
  };

  const handleAcceptCandidate = () => {
    if (!candidateRoute) return;
    setAcceptedRoadGeometry(candidateRoute.geometry);
    setAcceptedRoadMetrics({
      distanceKm: candidateRoute.distanceKm,
      durationMins: candidateRoute.durationMins,
      metadata: {
        ...candidateRoute.metadata,
        provider: candidateRoute.provider,
        warnings: candidateRoute.warnings,
        coordinate_count: candidateRoute.coordinateCount,
      },
    });
    setAcceptedFingerprint(candidateRoute.fingerprint);

    if (!durationMins && candidateRoute.durationMins) {
      setDurationMins(String(candidateRoute.durationMins));
    }

    if (!changeSummary || changeSummary === 'New route geometry draft') {
      setChangeSummary(
        `Road-following route geometry via ${candidateRoute.provider} (${candidateRoute.distanceKm} km, ~${candidateRoute.durationMins} mins)`
      );
    }

    setCandidateRoute(null);
    setSuccessMsg('Road route accepted! It is staged for this route. Save to persist.');
  };

  const handleRejectCandidate = () => {
    setCandidateRoute(null);
    setSuccessMsg('Candidate rejected. Kept previous route geometry and shaping points.');
  };

  const handleRevertToSchematic = () => {
    setAcceptedRoadGeometry(null);
    setAcceptedRoadMetrics(null);
    setAcceptedFingerprint(null);
    setSuccessMsg('Reverted to straight-line schematic geometry.');
  };

  // Step 2 & 3 Handlers
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

  // Save Draft Revision (for existing routes)
  const handleSaveDraftRevision = async () => {
    if (!existing?.id) return;
    setError(null);
    setSuccessMsg(null);

    const savePlan = resolveDraftSavePlan({
      points,
      acceptedRoadGeometry,
      acceptedRoadMetrics,
      acceptedFingerprint,
      changeSummary,
    });

    if (!savePlan.canSave) {
      setError(savePlan.error);
      return;
    }

    try {
      setSavingDraft(true);
      const payload = savePlan.payload;
      const currentRev = revisions.find((r) => r.id === selectedRevisionId);

      let savedRev: RouteRevision;
      if (currentRev && currentRev.status === 'draft') {
        savedRev = await apiFetch<RouteRevision>(
          `/api/schedules/routes/${existing.id}/revisions/${currentRev.id}/`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        );
      } else {
        savedRev = await apiFetch<RouteRevision>(
          `/api/schedules/routes/${existing.id}/revisions/`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
      }

      setSuccessMsg(`Draft Revision #${savedRev.revision_number} saved successfully!`);
      const updatedRevs = await apiFetch<RouteRevision[]>(`/api/schedules/routes/${existing.id}/revisions/`);
      setRevisions(updatedRevs);
      setSelectedRevisionId(savedRev.id);
      applyRevisionToEditor(savedRev);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to save draft revision.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Main Form Submission (Create or Update Route with geometry)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Route name is required.');
      return;
    }

    // Integrity Guard Check on Road Geometry
    let geometryPayload: {
      geometry?: GeoJsonLineString | null;
      total_distance_km?: number;
      estimated_duration_mins?: number;
      metadata?: Record<string, unknown>;
      change_summary?: string;
    } = {};

    if (acceptedRoadGeometry) {
      const savePlan = resolveDraftSavePlan({
        points,
        acceptedRoadGeometry,
        acceptedRoadMetrics,
        acceptedFingerprint,
        changeSummary,
      });

      if (!savePlan.canSave) {
        setError(savePlan.error);
        return;
      }
      geometryPayload = {
        geometry: savePlan.payload.geometry,
        total_distance_km: savePlan.payload.distance_km,
        estimated_duration_mins: savePlan.payload.duration_mins,
        metadata: savePlan.payload.metadata,
        change_summary: savePlan.payload.change_summary,
      };
    } else if (points.length >= 2) {
      const lineGeo = toGeoJsonLineString(points);
      if (lineGeo) {
        geometryPayload = {
          geometry: lineGeo,
          total_distance_km: distanceKm,
          estimated_duration_mins: schematicDurationMins,
          metadata: {
            mode: 'schematic',
            shaping_points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
          },
          change_summary: changeSummary || 'Schematic route geometry',
        };
      }
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
      estimated_duration_mins: durationMins ? Number(durationMins) : geometryPayload.estimated_duration_mins || null,
      is_published: isPublished,
      ...geometryPayload,
    };

    if (routeType === 'long') {
      const validStops = stops.filter((s) => s.name.trim());
      if (validStops.length === 0) {
        setError('Please add at least one pickup point for the long road route.');
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
        setError('Please add at least one trip timetable entry with a departure time.');
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      {/* Top Notification / Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block">Attention Required</strong>
              <span>{error}</span>
            </div>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-600 hover:text-red-900 font-bold text-lg leading-none">
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold text-lg leading-none">
            &times;
          </button>
        </div>
      )}

      {/* Header bar with Revision Switcher for existing routes */}
      {existing && revisions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" /> Versioned Revisions:
            </span>
            <select
              value={selectedRevisionId !== null ? String(selectedRevisionId) : 'new'}
              onChange={(e) => handleSelectRevision(e.target.value)}
              className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            >
              {revisions.map((r) => {
                const activeMark = existing.active_revision?.id === r.id ? ' ★ ACTIVE' : '';
                return (
                  <option key={r.id} value={r.id}>
                    Rev #{r.revision_number} [{r.status.toUpperCase()}]{activeMark} — {r.distance_km || 0} km
                  </option>
                );
              })}
              <option value="new">+ Start New Revision Draft</option>
            </select>
          </div>
          <div className="text-xs text-slate-500">
            Current Geometry Mode:{' '}
            <strong className="text-slate-800">
              {acceptedRoadGeometry ? 'Road Following' : points.length >= 2 ? 'Schematic' : 'Unset'}
            </strong>
          </div>
        </div>
      )}

      {/* Step 1: Route Type */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900 text-base">1. Select Route Type</h2>
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
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm text-slate-900">{opt.title}</div>
              <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Route Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 text-base">2. Route Configuration</h2>

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
              Published (visible to passengers)
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
          <h2 className="font-bold text-slate-900 text-base">
            {routeType === 'long' ? '3. Ordered Pickup Points' : '3. Trip Timetable'}
          </h2>
          <button
            type="button"
            onClick={routeType === 'long' ? addStop : addTrip}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1 shadow-xs transition-colors"
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

      {/* Step 4: Integrated Visual Route Builder & Road Path (Merged) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        {/* Step 4 Header & Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Map className="w-5 h-5 text-blue-600" />
              <span>4. Visual Route Builder & Road Path Refinement</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click on the map or drag waypoints to shape the route path through specific roads.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {mapStops.length >= 2 && (
              <button
                type="button"
                onClick={handleSyncPointsFromStops}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-slate-200"
                title="Populate shaping waypoints directly from pickup stops"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                <span>Sync from Pickup Stops</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleGenerateRoadRoute}
              disabled={generatingRoute || (points.length < 2 && mapStops.length < 2)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors ${
                isWaypointsRefined
                  ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              } disabled:opacity-50`}
            >
              {generatingRoute ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculating Road Route...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{acceptedRoadGeometry ? 'Regenerate Road Route' : 'Generate Road Route'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Informational Guidance Notice */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900 leading-relaxed">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <strong>Interactive Map Instructions: </strong>
            Click anywhere on the map to place or append shaping waypoints. Drag any marker to adjust the road alignment.
            Use <span className="font-semibold text-blue-700 bg-blue-100 px-1 py-0.2 rounded">[+] Insert After</span> in the Points tab to insert intermediate points between two existing waypoints.
          </div>
        </div>

        {/* Routing Error Notice */}
        {routingError && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{routingError}</span>
            </div>
            <button type="button" onClick={() => setRoutingError(null)} className="text-amber-700 hover:text-amber-950 font-bold ml-2">
              &times;
            </button>
          </div>
        )}

        {/* Candidate Road Route Preview Card */}
        {candidateRoute && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Road Route Candidate Generated
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                      {candidateRoute.provider} bus profile
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600">
                    Review the road preview on the map below. Accept to stage this road path for the route.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRejectCandidate}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <X className="w-3.5 h-3.5 text-slate-500" /> Reject Candidate
                </button>
                <button
                  type="button"
                  onClick={handleAcceptCandidate}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Check className="w-4 h-4" /> Accept Road Route
                </button>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-blue-200/60 text-xs">
              <div>
                <span className="text-slate-500 text-[11px]">Road Distance:</span>
                <div className="font-bold text-slate-900 text-sm">{candidateRoute.distanceKm} km</div>
                {acceptedRoadMetrics && (
                  <div className="text-[10px] text-blue-700 font-medium">
                    Δ {calculateDistanceDelta(candidateRoute.distanceKm, acceptedRoadMetrics.distanceKm).formatted} vs accepted
                  </div>
                )}
              </div>
              <div>
                <span className="text-slate-500 text-[11px]">Driving Time:</span>
                <div className="font-bold text-slate-900 text-sm">~{candidateRoute.durationMins} mins</div>
                <div className="text-[10px] text-slate-500">Dhaka urban profile</div>
              </div>
              <div>
                <span className="text-slate-500 text-[11px]">Road Coordinates:</span>
                <div className="font-bold text-slate-900 text-sm">{candidateRoute.coordinateCount} points</div>
                <div className="text-[10px] text-slate-500">From {points.length} waypoints</div>
              </div>
              <div>
                <span className="text-slate-500 text-[11px]">Waypoint Snapping:</span>
                <div className="font-bold text-slate-900 text-sm">
                  {calculateMaxSnapDisplacement(candidateRoute.waypointsSnapped)}m max
                </div>
                <div className="text-[10px] text-slate-500">
                  {candidateRoute.waypointsSnapped.length} points snapped
                </div>
              </div>
            </div>

            {candidateRoute.warnings && candidateRoute.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Warnings ({candidateRoute.warnings.length}):</span>
                </div>
                <ul className="list-disc list-inside pl-1 text-[11px] text-amber-800 space-y-0.5">
                  {candidateRoute.warnings.map((warn, wIdx) => (
                    <li key={wIdx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Accepted Road Route Notice Banner */}
        {acceptedRoadGeometry && !candidateRoute && (
          <div
            className={`rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm ${
              isWaypointsRefined
                ? 'bg-amber-50 border border-amber-300 text-amber-900'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {isWaypointsRefined ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <div>
                <strong className="font-semibold">
                  {isWaypointsRefined ? 'Waypoints Refined (Pending Road Update):' : 'Road-following geometry accepted:'}
                </strong>{' '}
                {acceptedRoadMetrics?.distanceKm} km &bull; ~{acceptedRoadMetrics?.durationMins} mins (
                {acceptedRoadGeometry.coordinates.length} road coordinates).
                {isWaypointsRefined ? (
                  <span className="text-amber-800 font-medium ml-1">
                    Shaping waypoints were moved. Click &quot;Regenerate Road Route&quot; to update or Revert to Schematic before saving.
                  </span>
                ) : (
                  <span className="text-emerald-700 ml-1">Ready to save with route.</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRevertToSchematic}
              className="text-xs underline font-semibold text-slate-700 hover:text-slate-900 ml-2 shrink-0"
            >
              Revert to Schematic
            </button>
          </div>
        )}

        {/* Metrics Overview Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Waypoints</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{points.length}</div>
            <div className="text-[10px] text-slate-400">
              {acceptedRoadGeometry ? `${acceptedRoadGeometry.coordinates.length} road vertices` : 'Shaping points'}
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Distance</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {candidateRoute
                ? `${candidateRoute.distanceKm} km`
                : acceptedRoadMetrics
                  ? `${acceptedRoadMetrics.distanceKm} km`
                  : `${distanceKm} km`}
            </div>
            <div className="text-[10px] text-slate-400">
              {candidateRoute || acceptedRoadGeometry ? 'Road network path' : 'Schematic straight line'}
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Est. Duration</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {candidateRoute
                ? `~${candidateRoute.durationMins} mins`
                : acceptedRoadMetrics
                  ? `~${acceptedRoadMetrics.durationMins} mins`
                  : `~${schematicDurationMins} mins`}
            </div>
            <div className="text-[10px] text-slate-400">
              {candidateRoute || acceptedRoadGeometry ? 'Urban bus speed profile' : 'Estimated default'}
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</div>
            <div className="mt-0.5">
              {candidateRoute ? (
                <span className="inline-flex items-center gap-1 text-blue-700 text-xs font-bold animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" /> Candidate Preview
                </span>
              ) : acceptedRoadGeometry ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isWaypointsRefined ? 'Refining Waypoints' : 'Road Route Ready'}
                </span>
              ) : validation.isValid ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready (Schematic)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {points.length < 2 ? 'Need ≥ 2 points' : 'Needs Fix'}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              {existing ? (existing.active_revision ? `Rev #${existing.active_revision.revision_number}` : 'Draft') : 'New Route'}
            </div>
          </div>
        </div>

        {/* Visual Map & Sidebar Tabs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map on the Left (2 cols) */}
          <div className="lg:col-span-2">
            <VisualRouteEditorMap
              points={points}
              onPointsChange={updatePointsWithHistory}
              selectedPointIndex={selectedPointIndex}
              onSelectPoint={setSelectedPointIndex}
              passengerStops={mapStops}
              routeColor={color}
              heightClass="h-[520px]"
              candidateGeometry={candidateRoute?.geometry}
              acceptedGeometry={acceptedRoadGeometry}
              insertAfterIndex={insertAfterIndex}
              onSetInsertAfterIndex={setInsertAfterIndex}
            />
          </div>

          {/* Right Panel Tabs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[520px] overflow-hidden">
            {/* Tab Selector */}
            <div className="flex border-b border-slate-200 text-xs font-semibold bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveRightTab('points')}
                className={`flex-1 py-2.5 px-3 border-b-2 text-center transition-colors ${
                  activeRightTab === 'points'
                    ? 'border-blue-600 text-blue-600 bg-white font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Points ({points.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('stops')}
                className={`flex-1 py-2.5 px-3 border-b-2 text-center transition-colors ${
                  activeRightTab === 'stops'
                    ? 'border-blue-600 text-blue-600 bg-white font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Stops ({mapStops.length})
              </button>
              {existing && (
                <button
                  type="button"
                  onClick={() => setActiveRightTab('revision')}
                  className={`flex-1 py-2.5 px-3 border-b-2 text-center transition-colors ${
                    activeRightTab === 'revision'
                      ? 'border-blue-600 text-blue-600 bg-white font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Revision
                </button>
              )}
            </div>

            {/* Tab Body */}
            <div className="p-3 flex-1 overflow-y-auto text-xs space-y-2">
              {activeRightTab === 'points' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={history.length === 0}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-medium inline-flex items-center gap-1"
                        title="Undo point change"
                      >
                        <RotateCcw className="w-3 h-3" /> Undo ({history.length})
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedPoint}
                        disabled={selectedPointIndex === null}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 text-slate-700 font-medium inline-flex items-center gap-1"
                        title="Delete selected point"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearAllPoints}
                      disabled={points.length === 0}
                      className="text-red-600 hover:underline disabled:opacity-40 text-[10px]"
                    >
                      Clear All
                    </button>
                  </div>

                  {insertAfterIndex !== null && (
                    <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] flex items-center justify-between">
                      <span>Inserting after Point #{insertAfterIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => setInsertAfterIndex(null)}
                        className="font-bold hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {points.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <MapPin className="w-7 h-7 mx-auto text-slate-300" />
                      <p className="font-medium text-slate-600">No shaping points yet</p>
                      <p className="text-[11px] max-w-[200px] mx-auto text-slate-500">
                        Click on the map to place waypoints, or click &quot;Sync from Pickup Stops&quot; above.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[380px] pr-1">
                      {points.map((pt, idx) => {
                        const isSelected = selectedPointIndex === idx;
                        const isInsertTarget = insertAfterIndex === idx;
                        const isStart = idx === 0;
                        const isEnd = idx === points.length - 1 && points.length > 1;

                        return (
                          <div
                            key={pt.id || idx}
                            onClick={() => setSelectedPointIndex(idx)}
                            className={`p-2 rounded-lg border text-xs flex flex-col gap-1 cursor-pointer transition-all ${
                              isInsertTarget
                                ? 'bg-blue-50 border-blue-400 shadow-xs ring-2 ring-blue-300'
                                : isSelected
                                  ? 'bg-amber-50 border-amber-300 shadow-xs ring-1 ring-amber-300'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                    isStart
                                      ? 'bg-emerald-600 text-white'
                                      : isEnd
                                        ? 'bg-red-600 text-white'
                                        : 'bg-blue-600 text-white'
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                                    {isStart ? 'Start Point' : isEnd ? 'End Point' : `Point #${idx + 1}`}
                                    {isInsertTarget && (
                                      <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold uppercase">
                                        Insert Target
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleMovePointUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                                  title="Move earlier"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMovePointDown(idx)}
                                  disabled={idx === points.length - 1}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                                  title="Move later"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleInsertAfter(idx)}
                                  className={`p-1 rounded transition-colors ${
                                    isInsertTarget ? 'text-blue-600 bg-blue-100 font-bold' : 'text-slate-400 hover:text-blue-600'
                                  }`}
                                  title="Insert point after this"
                                >
                                  <PlusCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = points.filter((_, i) => i !== idx);
                                    updatePointsWithHistory(updated);
                                    if (selectedPointIndex === idx) setSelectedPointIndex(null);
                                    if (insertAfterIndex === idx) setInsertAfterIndex(null);
                                  }}
                                  className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                                  title="Delete point"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeRightTab === 'stops' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                    <strong>Pickup Stops Reference:</strong>
                    <br />
                    These are the passenger boarding stops from Step 3. They are displayed as amber circles on the map.
                  </div>

                  {mapStops.length === 0 ? (
                    <p className="py-8 text-center text-slate-400 text-xs">
                      No pickup points with map locations yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[380px] pr-1">
                      {mapStops.map((stop) => (
                        <div
                          key={stop.id}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {stop.order}
                              </span>
                              <span>{stop.name}</span>
                              {stop.is_major_stop && (
                                <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.2 rounded font-bold">
                                  Major
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {stop.scheduled_time ? `Time: ${stop.scheduled_time}` : 'No schedule'} &bull; {Number(stop.latitude).toFixed(4)}, {Number(stop.longitude).toFixed(4)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeRightTab === 'revision' && existing && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Revision Change Summary
                    </label>
                    <textarea
                      rows={3}
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      placeholder="e.g., Road-following route refined via OSRM/Valhalla"
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-slate-600 text-[11px]">
                    <div>
                      <span className="text-slate-400">Total Revisions: </span>
                      <strong className="text-slate-800">{revisions.length}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Active Revision: </span>
                      <strong className="text-slate-800">
                        {existing.active_revision ? `#${existing.active_revision.revision_number}` : 'None'}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Form Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || savingDraft}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors"
          >
            {saving ? 'Saving...' : existing ? 'Save & Update Route' : 'Create Route'}
          </button>

          {existing && (
            <button
              type="button"
              onClick={handleSaveDraftRevision}
              disabled={saving || savingDraft || points.length === 0}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors inline-flex items-center gap-1.5"
              title="Save changes into a draft revision without immediately updating live active route"
            >
              <Save className="w-4 h-4" />
              <span>{savingDraft ? 'Saving Draft...' : 'Save Draft Revision'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>

        {isWaypointsRefined && (
          <div className="text-xs text-amber-800 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Waypoints refined: Click &quot;Regenerate Road Route&quot; or &quot;Revert to Schematic&quot; before saving.</span>
          </div>
        )}
      </div>

      {/* Stop Location Picker Modal (Step 3) */}
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
