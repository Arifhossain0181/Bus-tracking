'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import type { EditorPoint, GeoJsonLineString } from '@/lib/routeGeometry.ts';
import type { Stop } from '@/lib/types.ts';
import { Maximize2 } from 'lucide-react';

interface VisualRouteEditorMapProps {
  points: EditorPoint[];
  onPointsChange: (points: EditorPoint[]) => void;
  selectedPointIndex: number | null;
  onSelectPoint: (index: number | null) => void;
  passengerStops?: Stop[];
  routeColor?: string;
  isReadOnly?: boolean;
  heightClass?: string;
  candidateGeometry?: GeoJsonLineString | null;
  acceptedGeometry?: GeoJsonLineString | null;
  insertAfterIndex?: number | null;
  onSetInsertAfterIndex?: (index: number | null) => void;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function VisualRouteEditorMap({
  points,
  onPointsChange,
  selectedPointIndex,
  onSelectPoint,
  passengerStops = [],
  routeColor = '#2563eb',
  isReadOnly = false,
  heightClass = 'h-[550px]',
  candidateGeometry = null,
  acceptedGeometry = null,
  insertAfterIndex = null,
  onSetInsertAfterIndex,
}: VisualRouteEditorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const roadPolylineRef = useRef<L.Polyline | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const isDraggingRef = useRef(false);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(DEFAULT_CENTER, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const polyline = L.polyline([], {
      color: routeColor,
      weight: 5,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    polylineRef.current = polyline;

    const roadPolyline = L.polyline([], {
      color: routeColor,
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    roadPolylineRef.current = roadPolyline;

    const stopsGroup = L.layerGroup().addTo(map);
    stopsLayerRef.current = stopsGroup;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      polylineRef.current = null;
      roadPolylineRef.current = null;
      stopsLayerRef.current = null;
    };
  }, [routeColor]);

  // Click to Add or Insert Point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isReadOnly) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      // Don't add point if clicking on a marker or during drag
      if (isDraggingRef.current) return;

      const newPoint: EditorPoint = {
        id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        lat: Number(e.latlng.lat.toFixed(7)),
        lng: Number(e.latlng.lng.toFixed(7)),
      };

      let updated: EditorPoint[];
      let nextSelectedIndex: number;

      if (
        typeof insertAfterIndex === 'number' &&
        insertAfterIndex >= 0 &&
        insertAfterIndex < pointsRef.current.length
      ) {
        // Insert after the specified index
        updated = [
          ...pointsRef.current.slice(0, insertAfterIndex + 1),
          newPoint,
          ...pointsRef.current.slice(insertAfterIndex + 1),
        ];
        nextSelectedIndex = insertAfterIndex + 1;
        // Continue chaining insertion after this new point
        onSetInsertAfterIndex?.(nextSelectedIndex);
      } else {
        // Append at end
        updated = [...pointsRef.current, newPoint];
        nextSelectedIndex = updated.length - 1;
      }

      onPointsChange(updated);
      onSelectPoint(nextSelectedIndex);
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isReadOnly, insertAfterIndex, onPointsChange, onSelectPoint, onSetInsertAfterIndex]);

  // Fit bounds helper
  const handleFitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const roadCoords: [number, number][] =
      candidateGeometry?.coordinates.map((c) => [c[1], c[0]]) ||
      acceptedGeometry?.coordinates.map((c) => [c[1], c[0]]) ||
      [];
    const coords: [number, number][] = pointsRef.current.map((p) => [p.lat, p.lng]);
    const allCoords = [...roadCoords, ...coords];

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 16 });
      return;
    }

    if (passengerStops.length > 0) {
      const stopCoords: [number, number][] = passengerStops
        .map((s) => [Number(s.latitude), Number(s.longitude)])
        .filter(([lat, lng]) => !Number.isNaN(lat) && !Number.isNaN(lng)) as [number, number][];
      if (stopCoords.length > 0) {
        map.fitBounds(L.latLngBounds(stopCoords), { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [candidateGeometry, acceptedGeometry, passengerStops]);

  // Initial fit bounds when points or stops first load
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (!initialFitDoneRef.current && (points.length > 0 || passengerStops.length > 0)) {
      handleFitBounds();
      initialFitDoneRef.current = true;
    }
  }, [points.length, passengerStops.length, handleFitBounds]);

  // Render Passenger Stops Reference Layer
  useEffect(() => {
    const stopsGroup = stopsLayerRef.current;
    if (!stopsGroup) return;

    stopsGroup.clearLayers();

    passengerStops.forEach((stop) => {
      const lat = Number(stop.latitude);
      const lng = Number(stop.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      const marker = L.circleMarker([lat, lng], {
        radius: stop.is_major_stop ? 8 : 6,
        fillColor: '#f59e0b',
        color: '#78350f',
        weight: 2,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(
        `<strong>Stop #${stop.order}: ${stop.name}</strong><br/><span style="color:#64748b;font-size:11px;">Passenger Boarding Location (Reference)</span>`,
        { direction: 'top', offset: [0, -6] }
      );

      stopsGroup.addLayer(marker);
    });
  }, [passengerStops]);

  // Render & Synchronize Shaping Points and Polylines
  useEffect(() => {
    const map = mapRef.current;
    const polyline = polylineRef.current;
    const roadPolyline = roadPolylineRef.current;
    if (!map || !polyline || !roadPolyline) return;

    const coords: [number, number][] = points.map((p) => [p.lat, p.lng]);

    if (candidateGeometry && candidateGeometry.coordinates.length >= 2) {
      // Candidate Preview Mode:
      // Solid vibrant road line for candidate
      const candCoords: [number, number][] = candidateGeometry.coordinates.map((c) => [c[1], c[0]]);
      roadPolyline.setStyle({ color: routeColor, weight: 6, opacity: 0.95 });
      roadPolyline.setLatLngs(candCoords);

      // Muted dashed line for original schematic points
      polyline.setStyle({ color: '#94a3b8', weight: 3, opacity: 0.8, dashArray: '6, 6' });
      polyline.setLatLngs(coords);
    } else if (acceptedGeometry && acceptedGeometry.coordinates.length >= 2) {
      // Accepted Road Route Mode:
      // Solid vibrant road line for accepted geometry
      const accCoords: [number, number][] = acceptedGeometry.coordinates.map((c) => [c[1], c[0]]);
      roadPolyline.setStyle({ color: routeColor, weight: 5, opacity: 0.9 });
      roadPolyline.setLatLngs(accCoords);

      // Subtle dashed line for schematic shaping points
      polyline.setStyle({ color: '#cbd5e1', weight: 2, opacity: 0.6, dashArray: '4, 4' });
      polyline.setLatLngs(coords);
    } else {
      // Normal Schematic Mode:
      // Clear road line
      roadPolyline.setLatLngs([]);

      // Solid schematic line
      polyline.setStyle({ color: routeColor, weight: 5, opacity: 0.85, dashArray: undefined });
      polyline.setLatLngs(coords);
    }

    // If currently dragging, marker positions are already maintained by Leaflet drag events
    if (isDraggingRef.current) return;

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    // Create new markers
    points.forEach((pt, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === points.length - 1 && points.length > 1;
      const isSelected = selectedPointIndex === idx;

      let iconHtml = '';
      let iconSize: [number, number] = [28, 28];
      let iconAnchor: [number, number] = [14, 14];

      if (isStart) {
        iconHtml = `<div style="background:#16a34a;color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:3px 8px;font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;box-shadow:0 3px 8px rgba(0,0,0,0.35);cursor:grab;${
          isSelected ? 'box-shadow:0 0 0 4px #fbbf24;' : ''
        }"><span>●</span>Start</div>`;
        iconSize = [56, 24];
        iconAnchor = [28, 12];
      } else if (isEnd) {
        iconHtml = `<div style="background:#dc2626;color:#ffffff;border:2px solid #ffffff;border-radius:9999px;padding:3px 8px;font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;box-shadow:0 3px 8px rgba(0,0,0,0.35);cursor:grab;${
          isSelected ? 'box-shadow:0 0 0 4px #fbbf24;' : ''
        }"><span>■</span>End (#${idx + 1})</div>`;
        iconSize = [74, 24];
        iconAnchor = [37, 12];
      } else {
        iconHtml = `<div style="background:${
          isSelected ? '#f59e0b' : '#2563eb'
        };color:#ffffff;border:2px solid #ffffff;border-radius:9999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:grab;${
          isSelected ? 'box-shadow:0 0 0 4px #fbbf24;' : ''
        }">${idx + 1}</div>`;
        iconSize = [24, 24];
        iconAnchor = [12, 12];
      }

      const icon = L.divIcon({
        className: 'route-editor-point-icon',
        html: iconHtml,
        iconSize,
        iconAnchor,
      });

      const marker = L.marker([pt.lat, pt.lng], {
        icon,
        draggable: !isReadOnly,
        zIndexOffset: isSelected ? 1000 : isStart || isEnd ? 500 : 100,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectPoint(idx);
      });

      marker.on('dragstart', () => {
        isDraggingRef.current = true;
        onSelectPoint(idx);
      });

      marker.on('drag', (e) => {
        const target = e.target as L.Marker;
        const newLatLng = target.getLatLng();
        // Update live polyline during drag for silky smooth feedback
        const liveCoords = [...coords];
        liveCoords[idx] = [newLatLng.lat, newLatLng.lng];
        polyline.setLatLngs(liveCoords);
      });

      marker.on('dragend', (e) => {
        const target = e.target as L.Marker;
        const newLatLng = target.getLatLng();
        isDraggingRef.current = false;

        const updatedPoints = [...pointsRef.current];
        updatedPoints[idx] = {
          ...updatedPoints[idx],
          lat: Number(newLatLng.lat.toFixed(7)),
          lng: Number(newLatLng.lng.toFixed(7)),
        };
        onPointsChange(updatedPoints);
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [points, selectedPointIndex, isReadOnly, routeColor, candidateGeometry, acceptedGeometry, onPointsChange, onSelectPoint]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-300 shadow-inner">
      <div
        ref={containerRef}
        className={`w-full ${heightClass} ${isReadOnly ? 'cursor-default' : 'cursor-crosshair'}`}
      />

      {/* Floating Control Buttons */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleFitBounds}
          title="Fit view to route points and stops"
          className="p-2 bg-white/95 backdrop-blur text-slate-700 hover:text-slate-900 rounded-lg shadow-md border border-slate-200 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Insert Mode Indicator */}
      {typeof insertAfterIndex === 'number' &&
        insertAfterIndex >= 0 &&
        insertAfterIndex < points.length && (
          <div className="absolute top-3 left-3 z-[1000] bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 max-w-[calc(100%-80px)]">
            <span className="truncate">
              📍 Insert Mode: Click map to insert waypoint after Point #{insertAfterIndex + 1}
            </span>
            <button
              type="button"
              onClick={() => onSetInsertAfterIndex?.(null)}
              className="bg-blue-700 hover:bg-blue-800 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors shrink-0"
              title="Cancel insert mode and switch back to appending at end"
            >
              Cancel
            </button>
          </div>
        )}

      {/* Legend & Guidance overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur px-3 py-2 rounded-lg shadow-md border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center gap-3.5 max-w-[calc(100%-24px)]">
        {candidateGeometry ? (
          <>
            <div className="flex items-center gap-1.5 font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              <span className="w-3.5 h-1 bg-indigo-600 inline-block rounded" />
              <span>Road Candidate Preview</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="w-3.5 h-0.5 border-b-2 border-dashed border-slate-400 inline-block" />
              <span>Original Schematic</span>
            </div>
          </>
        ) : acceptedGeometry ? (
          <>
            <div className="flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <span className="w-3.5 h-1 bg-emerald-600 inline-block rounded" />
              <span>Accepted Road Route</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-slate-400">
              <span className="w-3.5 h-0.5 border-b border-dashed border-slate-300 inline-block" />
              <span>Shaping Points</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
              <span>Start</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              <span>Shaping Point</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
              <span>End</span>
            </div>
          </>
        )}
        {passengerStops.length > 0 && (
          <div className="flex items-center gap-1.5 font-medium text-amber-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>Passenger Stop (Reference)</span>
          </div>
        )}
        {!isReadOnly && !candidateGeometry && (
          <span className="text-slate-500 hidden sm:inline pl-2 border-l border-slate-200">
            Click map to place &bull; Insert with [+] &bull; Drag pins to move
          </span>
        )}
      </div>
    </div>
  );
}
