'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Check, MapPin, Navigation, X } from 'lucide-react';
import { ADMIN_MAP_TILE_URL, ADMIN_MAP_ATTRIBUTION } from '@/lib/mapConfig';

interface Props {
  isOpen: boolean;
  stopName: string;
  stopOrder: number;
  initialLat: number | null;
  initialLng: number | null;
  onSave: (lat: number, lng: number) => void;
  onClear: () => void;
  onClose: () => void;
}

const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

export default function StopLocationPickerModal({
  isOpen,
  stopName,
  stopOrder,
  initialLat,
  initialLng,
  onSave,
  onClear,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(
    initialLat != null && initialLng != null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)
      ? [initialLat, initialLng]
      : null
  );

  // Sync selectedCoords when initial coords change or modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialLat != null && initialLng != null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)) {
        setSelectedCoords([initialLat, initialLng]);
      } else {
        setSelectedCoords(null);
      }
    }
  }, [isOpen, initialLat, initialLng]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const center: [number, number] =
      initialLat != null && initialLng != null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)
        ? [initialLat, initialLng]
        : DEFAULT_CENTER;

    const zoom = initialLat != null && initialLng != null ? 15 : 13;

    const map = L.map(containerRef.current).setView(center, zoom);
    L.tileLayer(ADMIN_MAP_TILE_URL, {
      attribution: ADMIN_MAP_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Handle map clicks
    const handleClick = (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      setSelectedCoords([lat, lng]);
    };
    map.on('click', handleClick);

    // Ensure map tiles render properly after modal opens
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [isOpen, initialLat, initialLng]);

  // Update marker when selectedCoords changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedCoords) {
      if (markerRef.current) {
        markerRef.current.setLatLng(selectedCoords);
      } else {
        markerRef.current = L.circleMarker(selectedCoords, {
          radius: 9,
          fillColor: '#16a34a',
          color: '#ffffff',
          weight: 3,
          fillOpacity: 1,
        }).addTo(map);
      }
      markerRef.current
        .bindPopup(
          `<strong>${stopName || `Stop #${stopOrder}`}</strong><br/>Picked: ${selectedCoords[0]}, ${selectedCoords[1]}`
        )
        .openPopup();
    } else if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [selectedCoords, stopName, stopOrder]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setSelectedCoords([lat, lng]);
        mapRef.current?.setView([lat, lng], 16);
      },
      () => {
        // Geolocation error/fallback
      },
      { timeout: 8000 }
    );
  };

  const handleConfirm = () => {
    if (selectedCoords) {
      onSave(selectedCoords[0], selectedCoords[1]);
    } else {
      onClear();
    }
    onClose();
  };

  const handleClearLocation = () => {
    setSelectedCoords(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-lg">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Select Location on Map</h3>
              <p className="text-xs text-slate-300">
                Stop #{stopOrder}: {stopName ? `"${stopName}"` : 'Pickup Point'} (Optional)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Container */}
        <div className="relative">
          <div ref={containerRef} className="w-full h-80 sm:h-96 bg-slate-100" />
          <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="px-2.5 py-1.5 bg-white/95 backdrop-blur border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              title="Use current GPS position"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Current GPS</span>
            </button>
          </div>
          <div className="absolute bottom-2 left-3 z-[400] bg-white/90 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-slate-600 border border-slate-200 shadow-sm pointer-events-none">
            Click anywhere on the map to set pickup pin
          </div>
        </div>

        {/* Status / Selected Coordinates Display */}
        <div className="px-5 py-3 bg-slate-50 border-t border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            {selectedCoords ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-2.5 py-1 rounded-lg">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Picked: {selectedCoords[0].toFixed(5)}, {selectedCoords[1].toFixed(5)}
                </span>
              </span>
            ) : (
              <span className="text-slate-500 italic">
                No location selected yet. Location is optional.
              </span>
            )}
          </div>
          {selectedCoords && (
            <button
              type="button"
              onClick={handleClearLocation}
              className="text-xs text-red-600 hover:text-red-700 hover:underline font-medium"
            >
              Clear Selected Pin
            </button>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-white flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
          >
            {selectedCoords ? 'Confirm Location' : 'Keep Unset (Optional)'}
          </button>
        </div>
      </div>
    </div>
  );
}
