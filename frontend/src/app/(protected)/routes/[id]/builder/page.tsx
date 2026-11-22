'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Save,
  Send,
  Plus,
  Info,
  MapPin,
  Layers,
  Sparkles,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, ApiError } from '@/lib/api';
import type { RouteItem, RouteRevision } from '@/lib/types';
import {
  EditorPoint,
  GeoJsonLineString,
  fromGeoJsonLineString,
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

const VisualRouteEditorMap = dynamic(
  () => import('@/components/maps/VisualRouteEditorMap'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[550px] rounded-xl bg-slate-200 animate-pulse flex items-center justify-center text-slate-400 text-sm">
        Loading Route Editor Map...
      </div>
    ),
  }
);

type ActiveTab = 'points' | 'stops' | 'revision';

export default function VisualRouteBuilderPage() {
  const params = useParams();
  const { user } = useAuth();
  const routeId = params?.id as string;

  // Data State
  const [route, setRoute] = useState<RouteItem | null>(null);
  const [revisions, setRevisions] = useState<RouteRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | 'new' | null>(null);

  // Editor State
  const [points, setPoints] = useState<EditorPoint[]>([]);
  const [history, setHistory] = useState<EditorPoint[][]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('points');

  // Road Routing Candidate & Accepted State
  const [candidateRoute, setCandidateRoute] = useState<RoadRouteCandidate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [acceptedRoadGeometry, setAcceptedRoadGeometry] = useState<GeoJsonLineString | null>(null);
  const [acceptedRoadMetrics, setAcceptedRoadMetrics] = useState<{
    distanceKm: number;
    durationMins: number;
    metadata: Record<string, unknown>;
  } | null>(null);
  const [acceptedFingerprint, setAcceptedFingerprint] = useState<string | null>(null);

  // Refs for async stale response protection
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const generationRequestFpRef = useRef<string | null>(null);

  // UI / Status State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Permission check
  const canEdit = user?.role === 'admin' || user?.role === 'authority';

  // Helper to load revision geometry and metadata into state
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

  // Load Route and Revisions
  const loadRouteData = useCallback(async () => {
    if (!routeId) return;
    try {
      setLoading(true);
      const [routeData, revsData] = await Promise.all([
        apiFetch<RouteItem>(`/api/schedules/routes/${routeId}/`),
        apiFetch<RouteRevision[]>(`/api/schedules/routes/${routeId}/revisions/`).catch(() => []),
      ]);

      setRoute(routeData);
      setRevisions(revsData);

      // Auto-select latest draft or active revision or prompt new
      if (revsData.length > 0) {
        const draftRev = revsData.find((r) => r.status === 'draft');
        const activeRev = routeData.active_revision
          ? revsData.find((r) => r.id === routeData.active_revision?.id)
          : null;
        const target = draftRev || activeRev || revsData[0];

        setSelectedRevisionId(target.id);
        applyRevisionToEditor(target);
        setChangeSummary(target.change_summary || '');
      } else {
        setSelectedRevisionId('new');
        setPoints([]);
        setAcceptedRoadGeometry(null);
        setAcceptedRoadMetrics(null);
        setAcceptedFingerprint(null);
        setCandidateRoute(null);
        setInsertAfterIndex(null);
        setChangeSummary('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load route data';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [routeId, applyRevisionToEditor]);

  useEffect(() => {
    loadRouteData();
  }, [loadRouteData]);

  // Current Selected Revision object
  const currentRevision = useMemo(() => {
    if (selectedRevisionId === 'new' || selectedRevisionId === null) return null;
    return revisions.find((r) => r.id === selectedRevisionId) || null;
  }, [selectedRevisionId, revisions]);

  const isReadOnly = currentRevision ? currentRevision.status !== 'draft' : false;

  // Validation & Metrics (for shaping points)
  const validation = useMemo(() => validateRouteGeometry(points), [points]);
  const distanceKm = useMemo(() => calculatePathDistanceKm(points), [points]);
  const durationMins = useMemo(() => estimateDurationMinutes(distanceKm), [distanceKm]);

  // Check if shaping points have been modified since current road route was accepted (or if fingerprint is invalid)
  const isWaypointsRefined = useMemo(() => {
    if (!acceptedRoadGeometry) return false;
    if (!acceptedFingerprint || !acceptedFingerprint.trim()) return true;
    return computeWaypointsFingerprint(points) !== acceptedFingerprint;
  }, [acceptedRoadGeometry, acceptedFingerprint, points]);

  // Points modification helper with history stack and stale candidate invalidation
  // Task 019: Modifying shaping points invalidates any candidate, but PRESERVES acceptedRoadGeometry!
  const updatePointsWithHistory = useCallback(
    (nextPoints: EditorPoint[]) => {
      setHistory((prev) => [...prev.slice(-25), points]);
      setPoints(nextPoints);
      setSuccessMsg(null);
      setErrorMsg(null);

      // Invalidation check: If waypoints change, candidate road preview is stale
      const currentFp = computeWaypointsFingerprint(points);
      const nextFp = computeWaypointsFingerprint(nextPoints);
      if (currentFp !== nextFp) {
        if (candidateRoute) {
          setCandidateRoute(null);
          setErrorMsg('Candidate road route preview was cleared because shaping waypoints changed.');
        }
      }

      // If insert index is out of bounds with new points, reset it
      if (insertAfterIndex !== null && insertAfterIndex >= nextPoints.length) {
        setInsertAfterIndex(null);
      }
    },
    [points, candidateRoute, insertAfterIndex]
  );

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setPoints(previous);
    setSelectedPointIndex(null);
    setInsertAfterIndex(null);

    // Invalidate stale candidates on undo (accepted road route remains preserved)
    const currentFp = computeWaypointsFingerprint(points);
    const prevFp = computeWaypointsFingerprint(previous);
    if (currentFp !== prevFp && candidateRoute) {
      setCandidateRoute(null);
      setErrorMsg('Candidate road route preview cleared on undo.');
    }
  }, [history, points, candidateRoute]);

  // Delete Selected Point
  const handleDeleteSelected = useCallback(() => {
    if (selectedPointIndex === null || selectedPointIndex < 0 || selectedPointIndex >= points.length) return;
    const updated = points.filter((_, idx) => idx !== selectedPointIndex);
    updatePointsWithHistory(updated);
    setSelectedPointIndex(null);
    setInsertAfterIndex(null);
  }, [selectedPointIndex, points, updatePointsWithHistory]);

  // Move Point Up in Sequence
  const handleMovePointUp = useCallback(
    (idx: number) => {
      if (idx <= 0 || idx >= points.length || isReadOnly) return;
      const updated = movePoint(points, idx, idx - 1);
      updatePointsWithHistory(updated);
      setSelectedPointIndex(idx - 1);
      if (insertAfterIndex === idx) setInsertAfterIndex(idx - 1);
      else if (insertAfterIndex === idx - 1) setInsertAfterIndex(idx);
    },
    [points, isReadOnly, insertAfterIndex, updatePointsWithHistory]
  );

  // Move Point Down in Sequence
  const handleMovePointDown = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= points.length - 1 || isReadOnly) return;
      const updated = movePoint(points, idx, idx + 1);
      updatePointsWithHistory(updated);
      setSelectedPointIndex(idx + 1);
      if (insertAfterIndex === idx) setInsertAfterIndex(idx + 1);
      else if (insertAfterIndex === idx + 1) setInsertAfterIndex(idx);
    },
    [points, isReadOnly, insertAfterIndex, updatePointsWithHistory]
  );

  // Toggle Insert After Point
  const handleToggleInsertAfter = useCallback(
    (idx: number) => {
      if (insertAfterIndex === idx) {
        setInsertAfterIndex(null);
      } else {
        setInsertAfterIndex(idx);
        setSelectedPointIndex(idx);
      }
    },
    [insertAfterIndex]
  );

  // Clear All Points
  const handleClearAll = useCallback(() => {
    if (points.length === 0) return;
    if (!window.confirm('Clear all shaping points from this draft?')) return;
    updatePointsWithHistory([]);
    setSelectedPointIndex(null);
    setInsertAfterIndex(null);
  }, [points.length, updatePointsWithHistory]);

  // Handle Revision Switch
  const handleSelectRevision = useCallback(
    (val: string) => {
      setErrorMsg(null);
      setSuccessMsg(null);
      setHistory([]);
      setCandidateRoute(null);
      setInsertAfterIndex(null);

      if (val === 'new') {
        setSelectedRevisionId('new');
        setPoints([]);
        setAcceptedRoadGeometry(null);
        setAcceptedRoadMetrics(null);
        setAcceptedFingerprint(null);
        setChangeSummary('');
        setSelectedPointIndex(null);
        return;
      }

      const revId = Number(val);
      const rev = revisions.find((r) => r.id === revId);
      if (rev) {
        setSelectedRevisionId(revId);
        applyRevisionToEditor(rev);
        setChangeSummary(rev.change_summary || '');
        setSelectedPointIndex(null);
      }
    },
    [revisions, applyRevisionToEditor]
  );

  // Fork current revision into a new draft
  const handleForkDraft = useCallback(() => {
    setSelectedRevisionId('new');
    setChangeSummary(
      currentRevision
        ? `Revision based on #${currentRevision.revision_number} (${currentRevision.status})`
        : 'New route geometry draft'
    );
    setHistory([]);
    setInsertAfterIndex(null);
    setSuccessMsg('Created new draft copy! You can now edit and save.');
  }, [currentRevision]);

  // Generate / Regenerate Road Route Preview from Backend
  const handleGenerateRoadRoute = async () => {
    if (!route || points.length < 2 || isReadOnly || isGenerating) return;
    if (!validation.isValid) {
      setErrorMsg(validation.error || 'Please fix invalid shaping points before generating road route.');
      return;
    }

    const requestFp = computeWaypointsFingerprint(points);
    generationRequestFpRef.current = requestFp;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsGenerating(true);

    try {
      const payload = {
        waypoints: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        profile: 'bus',
      };

      const res = await apiFetch<RoadRouteResponse>(
        `/api/schedules/routes/${route.id}/generate-geometry/`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      // Async Stale Response Protection: Check if waypoints changed while request was in-flight
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
        `Generated road route candidate via ${res.provider} (${res.distance_km} km, ${res.coordinate_count} vertices). Preview on the map below and Accept or Reject.`
      );
    } catch (err: unknown) {
      // Regeneration failure: preserves current accepted route and shaping points
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to generate road route';
      setErrorMsg(
        `Road routing failed: ${msg}. Any previously accepted route and your shaping points are preserved.`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Accept Candidate Road Route
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

    if (!changeSummary || changeSummary === 'New route geometry draft') {
      setChangeSummary(
        `Road-following route geometry via ${candidateRoute.provider} (${candidateRoute.distanceKm} km, ~${candidateRoute.durationMins} mins)`
      );
    }

    setCandidateRoute(null);
    setSuccessMsg(
      'Road route geometry accepted! The road path is staged. Click "Save Draft" to persist this revision.'
    );
  };

  // Reject Candidate Road Route (Non-destructive: preserves existing accepted route & shaping points)
  const handleRejectCandidate = () => {
    setCandidateRoute(null);
    if (acceptedRoadGeometry) {
      setSuccessMsg('Road route candidate rejected. Retained previously accepted road route and current shaping points.');
    } else {
      setSuccessMsg('Road route candidate rejected. Retained original shaping points.');
    }
  };

  // Revert back to Schematic straight lines (Explicit action)
  const handleRevertToSchematic = () => {
    setAcceptedRoadGeometry(null);
    setAcceptedRoadMetrics(null);
    setAcceptedFingerprint(null);
    setSuccessMsg('Reverted back to straight-line schematic geometry.');
  };

  // Save Draft Revision
  const handleSaveDraft = async () => {
    if (!route) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    // Enforce integrity guard: Prevent persisting stale accepted road route with modified waypoints
    const savePlan = resolveDraftSavePlan({
      points,
      acceptedRoadGeometry,
      acceptedRoadMetrics,
      acceptedFingerprint,
      changeSummary,
    });

    if (!savePlan.canSave) {
      setErrorMsg(savePlan.error);
      return;
    }

    try {
      setSaving(true);
      const payload = savePlan.payload;
      let savedRev: RouteRevision;

      if (currentRevision && currentRevision.status === 'draft') {
        savedRev = await apiFetch<RouteRevision>(
          `/api/schedules/routes/${route.id}/revisions/${currentRevision.id}/`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        );
      } else {
        savedRev = await apiFetch<RouteRevision>(
          `/api/schedules/routes/${route.id}/revisions/`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
      }

      setSuccessMsg(`Draft Revision #${savedRev.revision_number} saved successfully!`);
      const updatedRevs = await apiFetch<RouteRevision[]>(`/api/schedules/routes/${route.id}/revisions/`);
      setRevisions(updatedRevs);
      setSelectedRevisionId(savedRev.id);
      applyRevisionToEditor(savedRev);
      setHistory([]);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save draft revision';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  // Publish Revision
  const handlePublish = async () => {
    if (!route) return;
    if (!validation.isValid) {
      setErrorMsg(validation.error || 'Cannot publish an invalid route geometry.');
      return;
    }

    if (!currentRevision || currentRevision.status !== 'draft') {
      setErrorMsg('Please save your changes as a draft first before publishing.');
      return;
    }

    if (
      !window.confirm(
        `Publish Revision #${currentRevision.revision_number} as the official active route geometry? This will lock this revision.`
      )
    ) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      setPublishing(true);
      const publishedRev = await apiFetch<RouteRevision>(
        `/api/schedules/routes/${route.id}/revisions/${currentRevision.id}/publish/`,
        {
          method: 'POST',
        }
      );

      setSuccessMsg(
        `Revision #${publishedRev.revision_number} successfully published as active route geometry!`
      );
      await loadRouteData();
      setSelectedRevisionId(publishedRev.id);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to publish revision';
      setErrorMsg(msg);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent align-[-0.125em]" />
        <p className="mt-4 text-sm text-slate-500">Loading Route Builder...</p>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-base font-semibold text-red-600">Route not found</p>
        <Link
          href="/routes"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Routes
        </Link>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Permission Required</h2>
        <p className="text-sm text-slate-600">
          Only administrators and authorities are authorized to edit route geometry and publish revisions.
        </p>
        <Link
          href={`/routes/${route.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          View Route Details
        </Link>
      </div>
    );
  }

  const isActiveRevision = Boolean(
    route.active_revision && currentRevision && route.active_revision.id === currentRevision.id
  );

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/routes/${route.id}`}
            className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
            title="Back to Route Details"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{route.name}</h1>
              <span
                className="px-2 py-0.5 rounded text-xs font-semibold text-white uppercase tracking-wider"
                style={{ backgroundColor: route.color || '#2563eb' }}
              >
                {route.route_type}
              </span>
              {isActiveRevision && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active Geometry
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Visual Route Geometry Editor &bull; Revisions &bull; Waypoint Refinement
            </p>
          </div>
        </div>

        {/* Revision Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="rev-select" className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Revision:
          </label>
          <select
            id="rev-select"
            value={selectedRevisionId !== null ? String(selectedRevisionId) : 'new'}
            onChange={(e) => handleSelectRevision(e.target.value)}
            className="text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
          >
            {revisions.map((r) => {
              const activeMark = route.active_revision?.id === r.id ? ' ★ ACTIVE' : '';
              return (
                <option key={r.id} value={r.id}>
                  Rev #{r.revision_number} [{r.status.toUpperCase()}]{activeMark} — {r.distance_km || 0} km
                </option>
              );
            })}
            <option value="new">+ Start New Draft</option>
          </select>

          {isReadOnly && (
            <button
              type="button"
              onClick={handleForkDraft}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Fork to Draft
            </button>
          )}
        </div>
      </div>

      {/* MVP Schematic / Road Geometry Notice Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-amber-900 text-xs shadow-sm">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <strong className="font-semibold">Waypoint Refinement Workflow: </strong>
          Place or drag shaping waypoints to guide the bus route through specific roads. Use{' '}
          <span className="font-semibold text-blue-700 bg-blue-100 px-1 py-0.5 rounded">
            [+] Insert After
          </span>{' '}
          in the Points tab to insert intermediate waypoints between existing segments. Click{' '}
          <span className="font-semibold text-blue-700 bg-blue-100 px-1 py-0.5 rounded">
            ✨ {acceptedRoadGeometry ? 'Regenerate Road Route' : 'Generate Road Route'}
          </span>{' '}
          to compute the road path. Passenger stops remain read-only reference markers.
        </div>
      </div>

      {/* Notification Banners */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-base leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900 font-bold ml-2 text-base leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Candidate Preview Card */}
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
                  Review the road path preview on the map below. The bold solid line shows the candidate path; the
                  dashed line shows your shaping waypoints.
                </p>
              </div>
            </div>

            {/* Accept / Reject Action Buttons */}
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

          {/* Comparison and Quality Metrics */}
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
              <div className="text-[10px] text-slate-500">Urban bus speed profile</div>
            </div>
            <div>
              <span className="text-slate-500 text-[11px]">Road Vertices:</span>
              <div className="font-bold text-slate-900 text-sm">
                {candidateRoute.coordinateCount} coordinates
              </div>
              <div className="text-[10px] text-slate-500">From {points.length} waypoints</div>
            </div>
            <div>
              <span className="text-slate-500 text-[11px]">Waypoint Snapping:</span>
              <div className="font-bold text-slate-900 text-sm">
                {calculateMaxSnapDisplacement(candidateRoute.waypointsSnapped)}m max snap
              </div>
              <div className="text-[10px] text-slate-500">
                {candidateRoute.waypointsSnapped.length} points snapped
              </div>
            </div>
          </div>

          {/* Warnings (if any) */}
          {candidateRoute.warnings && candidateRoute.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Routing Warnings ({candidateRoute.warnings.length}):</span>
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

      {/* Accepted Road Route Staged Notice */}
      {acceptedRoadGeometry && !candidateRoute && (
        <div
          className={`rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm ${isWaypointsRefined
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
                {isWaypointsRefined ? 'Waypoints Refined (Pending Road Update):' : 'Road-following geometry staged:'}
              </strong>{' '}
              {acceptedRoadMetrics?.distanceKm} km &bull; ~{acceptedRoadMetrics?.durationMins} mins (
              {acceptedRoadGeometry.coordinates.length} vertices).
              {isWaypointsRefined ? (
                <span className="text-amber-800 font-medium ml-1">
                  Shaping waypoints were modified. Click &quot;Regenerate Road Route&quot; to update the road path to match.
                </span>
              ) : (
                <span className="text-emerald-700 ml-1">Click &quot;Save Draft&quot; to persist this revision.</span>
              )}
            </div>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleRevertToSchematic}
              className={`text-xs underline font-semibold ml-2 shrink-0 ${isWaypointsRefined
                ? 'text-amber-800 hover:text-amber-950'
                : 'text-emerald-800 hover:text-emerald-950'
                }`}
            >
              Revert to Schematic
            </button>
          )}
        </div>
      )}

      {/* Metrics & Validation Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Points</div>
          <div className="text-xl font-bold text-slate-900 mt-0.5">{points.length}</div>
          <div className="text-[10px] text-slate-400">
            {candidateRoute
              ? `+ ${candidateRoute.coordinateCount} road coords`
              : acceptedRoadGeometry
                ? `+ ${acceptedRoadGeometry.coordinates.length} road coords`
                : 'Shaping waypoints'}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Path Distance</div>
          <div className="text-xl font-bold text-slate-900 mt-0.5">
            {candidateRoute
              ? `${candidateRoute.distanceKm} km`
              : acceptedRoadMetrics
                ? `${acceptedRoadMetrics.distanceKm} km`
                : `${distanceKm} km`}
          </div>
          <div className="text-[10px] text-slate-400">
            {candidateRoute
              ? 'Road candidate preview'
              : acceptedRoadGeometry
                ? 'Accepted road route'
                : 'Straight-line total'}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Est. Duration</div>
          <div className="text-xl font-bold text-slate-900 mt-0.5">
            {candidateRoute
              ? `~${candidateRoute.durationMins} mins`
              : acceptedRoadMetrics
                ? `~${acceptedRoadMetrics.durationMins} mins`
                : `~${durationMins} mins`}
          </div>
          <div className="text-[10px] text-slate-400">
            {candidateRoute || acceptedRoadGeometry ? 'Valhalla bus routing' : 'At 25 km/h urban speed'}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</div>
          <div className="mt-0.5">
            {candidateRoute ? (
              <span className="inline-flex items-center gap-1 text-blue-700 text-xs font-bold animate-pulse">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Previewing Road</span>
              </span>
            ) : acceptedRoadGeometry ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{isWaypointsRefined ? 'Refining Waypoints' : 'Road Accepted'}</span>
              </span>
            ) : validation.isValid ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ready (Schematic)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-bold" title={validation.error}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{points.length < 2 ? 'Need ≥ 2 points' : 'Needs Fix'}</span>
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {currentRevision ? `Rev #${currentRevision.revision_number} (${currentRevision.status})` : 'New Draft'}
          </div>
        </div>
      </div>

      {/* Editor Toolbar */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0 || isReadOnly}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            title="Undo last modification"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Undo ({history.length})
          </button>

          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedPointIndex === null || isReadOnly}
            className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-slate-700 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            title="Remove currently selected point"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Selected {selectedPointIndex !== null ? `(#${selectedPointIndex + 1})` : ''}
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            disabled={points.length === 0 || isReadOnly}
            className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-slate-700 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            title="Clear all points"
          >
            Clear All
          </button>

          {/* Road Routing Button (Generate / Regenerate) */}
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleGenerateRoadRoute}
              disabled={points.length < 2 || isGenerating}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs ${isWaypointsRefined
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 animate-pulse'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                } disabled:opacity-40 disabled:hover:bg-blue-50`}
              title={
                points.length < 2
                  ? 'Add at least 2 points to generate road route'
                  : acceptedRoadGeometry
                    ? 'Regenerate road-following route from updated shaping points'
                    : 'Generate road-following route via Valhalla routing engine'
              }
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              {isGenerating
                ? 'Routing...'
                : acceptedRoadGeometry
                  ? 'Regenerate Road Route'
                  : 'Generate Road Route'}
            </button>
          )}

          {/* Active Insert Mode Pill in Toolbar */}
          {insertAfterIndex !== null && insertAfterIndex < points.length && (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-medium border border-blue-200">
              <span>Inserting after #{insertAfterIndex + 1}</span>
              <button
                type="button"
                onClick={() => setInsertAfterIndex(null)}
                className="hover:text-blue-950 font-bold ml-1 text-sm leading-none"
                title="Switch back to appending at end"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons (Save / Publish) */}
        <div className="flex items-center gap-2 flex-wrap">
          {isReadOnly ? (
            <div className="text-xs text-slate-500 italic pr-2">
              Revision is {currentRevision?.status} (Read-only)
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || points.length === 0}
                className="px-4 py-2 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                title={
                  isWaypointsRefined
                    ? 'Waypoints have changed since road route was accepted. Regenerate road route or revert to schematic before saving.'
                    : 'Save Draft Revision'
                }
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>

              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || !validation.isValid || !currentRevision || currentRevision.status !== 'draft'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                title={
                  !currentRevision || currentRevision.status !== 'draft'
                    ? 'Save draft first to publish'
                    : 'Publish as active route geometry'
                }
              >
                <Send className="w-3.5 h-3.5" />
                {publishing ? 'Publishing...' : 'Publish Revision'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Grid: Map (Left) + Control Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map Area */}
        <div className="lg:col-span-2">
          <VisualRouteEditorMap
            points={points}
            onPointsChange={updatePointsWithHistory}
            selectedPointIndex={selectedPointIndex}
            onSelectPoint={setSelectedPointIndex}
            passengerStops={route.stops}
            routeColor={route.color || '#2563eb'}
            isReadOnly={isReadOnly}
            heightClass="h-[550px]"
            candidateGeometry={candidateRoute?.geometry}
            acceptedGeometry={acceptedRoadGeometry}
            insertAfterIndex={insertAfterIndex}
            onSetInsertAfterIndex={setInsertAfterIndex}
          />
        </div>

        {/* Right Sidebar Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[550px] overflow-hidden">
          {/* Tab Header */}
          <div className="flex border-b border-slate-200 text-xs font-semibold bg-slate-50">
            <button
              type="button"
              onClick={() => setActiveTab('points')}
              className={`flex-1 py-2.5 px-3 border-b-2 text-center transition-colors ${activeTab === 'points'
                ? 'border-blue-600 text-blue-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              Points ({points.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stops')}
              className={`flex-1 py-2.5 px-3 border-b-2 text-center transition-colors ${activeTab === 'stops'
                ? 'border-blue-600 text-blue-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              Stops ({route.stops?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('revision')}
              className={`flex-1 py-2.5 px-3 border-b-2 text-center transition-colors ${activeTab === 'revision'
                ? 'border-blue-600 text-blue-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              Details
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-3.5 flex-1 overflow-y-auto text-xs space-y-3">
            {activeTab === 'points' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-slate-100">
                  <span>Shaping Waypoints ({points.length})</span>
                  {insertAfterIndex !== null ? (
                    <button
                      type="button"
                      onClick={() => setInsertAfterIndex(null)}
                      className="text-blue-600 hover:underline text-[10px] font-semibold"
                    >
                      Reset to Append
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400">Click [+] to insert after point</span>
                  )}
                </div>

                {points.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <MapPin className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-medium text-slate-600">No shaping points yet</p>
                    <p className="text-[11px] max-w-[200px] mx-auto">
                      Click anywhere on the map to place the start and subsequent points along the route.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[440px] pr-1">
                    {points.map((pt, idx) => {
                      const isSelected = selectedPointIndex === idx;
                      const isInsertTarget = insertAfterIndex === idx;
                      const isStart = idx === 0;
                      const isEnd = idx === points.length - 1 && points.length > 1;

                      return (
                        <div
                          key={pt.id || idx}
                          onClick={() => setSelectedPointIndex(idx)}
                          className={`p-2 rounded-lg border text-xs flex flex-col gap-1 cursor-pointer transition-all ${isInsertTarget
                            ? 'bg-blue-50 border-blue-400 shadow-xs ring-2 ring-blue-300'
                            : isSelected
                              ? 'bg-amber-50 border-amber-300 shadow-xs ring-1 ring-amber-300'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                            }`}
                        >
                          <div className="flex items-center justify-between min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${isStart
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

                            {/* Point Control Actions */}
                            {!isReadOnly && (
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {/* Move Up */}
                                <button
                                  type="button"
                                  onClick={() => handleMovePointUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                  title="Move earlier in route sequence"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  onClick={() => handleMovePointDown(idx)}
                                  disabled={idx === points.length - 1}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                  title="Move later in route sequence"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>

                                {/* Insert After */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleInsertAfter(idx)}
                                  className={`p-1 rounded transition-colors ${isInsertTarget
                                    ? 'text-blue-600 bg-blue-100 font-bold'
                                    : 'text-slate-400 hover:text-blue-600'
                                    }`}
                                  title={
                                    isInsertTarget
                                      ? 'Cancel insert mode'
                                      : `Click to arm insert mode after Point #${idx + 1}`
                                  }
                                >
                                  <PlusCircle className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete Point */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = points.filter((_, i) => i !== idx);
                                    updatePointsWithHistory(updated);
                                    if (selectedPointIndex === idx) setSelectedPointIndex(null);
                                    if (insertAfterIndex === idx) setInsertAfterIndex(null);
                                  }}
                                  className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                                  title="Delete this point"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stops' && (
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                  <strong>Passenger Stops Reference:</strong>
                  <br />
                  These are boarding points passengers use. In the Visual Route Builder, they are displayed on the
                  map as amber circles so you can trace route shaping points through them.
                </div>

                {route.stops.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-xs">
                    No passenger stops defined for this route.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[380px] pr-1">
                    {route.stops.map((stop) => (
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
                            {stop.scheduled_time ? `Scheduled: ${stop.scheduled_time}` : 'No schedule'} &bull; Lat:{' '}
                            {Number(stop.latitude).toFixed(4)}, Lng: {Number(stop.longitude).toFixed(4)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'revision' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="change-summary" className="block text-xs font-semibold text-slate-700 mb-1">
                    Revision Change Summary
                  </label>
                  <textarea
                    id="change-summary"
                    rows={4}
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Describe what changed in this geometry revision (e.g., Road-following route refined via Valhalla)"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                {currentRevision && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-slate-600 text-[11px]">
                    <div>
                      <span className="text-slate-400">Revision Number: </span>
                      <strong className="text-slate-800">#{currentRevision.revision_number}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Status: </span>
                      <strong className="text-slate-800 uppercase">{currentRevision.status}</strong>
                    </div>
                    {currentRevision.metadata && (
                      <div>
                        <span className="text-slate-400">Mode: </span>
                        <span className="text-slate-800 font-semibold">
                          {(currentRevision.metadata as Record<string, unknown>).mode === 'road_route'
                            ? `Road Route (${(currentRevision.metadata as Record<string, unknown>).provider || 'Valhalla'})`
                            : 'Schematic'}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Created: </span>
                      <span className="text-slate-800">{new Date(currentRevision.created_at).toLocaleString()}</span>
                    </div>
                    {currentRevision.created_by_name && (
                      <div>
                        <span className="text-slate-400">Created By: </span>
                        <span className="text-slate-800">{currentRevision.created_by_name}</span>
                      </div>
                    )}
                    {currentRevision.published_at && (
                      <div>
                        <span className="text-slate-400">Published At: </span>
                        <span className="text-slate-800">
                          {new Date(currentRevision.published_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
