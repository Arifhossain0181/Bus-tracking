'use client';

import React, { useMemo } from 'react';
import type { ActiveDriverLocation, Bus } from '@/lib/types';
import { isValidCoordinate, calculateLocationAgeSeconds, GPS_FRESHNESS_THRESHOLDS } from '@/lib/trackingStatus';
import BusGisMap from './BusGisMap';
import type { ActiveBusData } from '@/lib/map3d/threeMapLayer';
import type { StopInfo } from '@/lib/map3d/routeGeometry';

interface Props {
  drivers: ActiveDriverLocation[];
  busesList?: Bus[];
  routePath?: [number, number][];
  roadGeometry?: [number, number][];
  stops?: StopInfo[];
  routeName?: string;
  originName?: string;
  destinationName?: string;
  userPosition: [number, number] | null;
  focusedDriverId: number | null;
  followingDriverId: number | null;
  onSelectDriver?: (driverId: number) => void;
  heightClass?: string;
}

export default function LiveMapView({
  drivers,
  busesList = [],
  routePath,
  roadGeometry,
  stops = [],
  routeName,
  originName,
  destinationName,
  userPosition,
  focusedDriverId,
  followingDriverId,
  onSelectDriver,
  heightClass = 'h-[750px]',
}: Props) {
  // Convert ActiveDriverLocation[] + Bus[] to 3D ActiveBusData[]
  const buses: ActiveBusData[] = useMemo(() => {
    const list: ActiveBusData[] = [];
    const activeBusNumbers = new Set<string>();

    // 1. Live telemetry drivers (Highest Priority)
    drivers.forEach((d) => {
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      if (!isValidCoordinate(lat, lng)) {
        return; // Reject invalid or (0,0) driver coordinates
      }

      const bNum = d.bus_number ? `Bus #${d.bus_number}` : `Bus #${d.driver_id}`;
      activeBusNumbers.add(d.bus_number || String(d.driver_id));
      const rawSpeed = d.speed != null ? Number(d.speed) : null;
      const ageSec = calculateLocationAgeSeconds(d.last_updated);

      // GPS Freshness vs Movement State:
      // 1. If GPS is stale (> 30s) but <= 120s: status is 'stale' (never falsely live even if speed > 0)
      // 2. If GPS is older than 120s: status is 'offline'
      // 3. If GPS is fresh (<= 30s):
      //    - If speed is measured positive (>1 m/s): 'moving'
      //    - If speed is measured zero (<=1 m/s): 'stopped'
      //    - If speed is unavailable: 'live'
      let driverStatus: ActiveBusData['status'];
      if (ageSec != null && ageSec > GPS_FRESHNESS_THRESHOLDS.STALE_MAX_SECONDS) {
        driverStatus = 'offline';
      } else if (ageSec != null && ageSec > GPS_FRESHNESS_THRESHOLDS.LIVE_MAX_SECONDS) {
        driverStatus = 'stale';
      } else if (rawSpeed != null) {
        driverStatus = rawSpeed > 1 ? 'moving' : 'stopped';
      } else {
        driverStatus = 'live';
      }

      list.push({
        id: d.driver_id,
        busNumber: bNum,
        routeName: d.route_name || 'IUBAT Transit Line',
        driverName: d.driver_name,
        speed: rawSpeed,
        heading: d.heading != null ? d.heading : 165,
        latitude: lat,
        longitude: lng,
        lastUpdated: d.last_updated,
        accentColor: followingDriverId === d.driver_id ? '#00e5ff' : '#10b981',
        status: driverStatus,
      });
    });

    // 2. Add fleet buses that aren't actively streaming telemetry (only if they have verified coordinates)
    (busesList || []).forEach((b) => {
      if (activeBusNumbers.has(b.bus_number) || activeBusNumbers.has(String(b.id))) {
        return;
      }
      const loc = b.latest_location;
      // Do NOT fabricate fallback campus coordinates. Only place buses with genuine, valid coordinates.
      if (!loc || !isValidCoordinate(loc.latitude, loc.longitude)) {
        return;
      }
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      const rawFleetSpeed = loc?.speed != null ? Number(loc.speed) : null;
      const fleetTimestamp = loc?.timestamp || b.updated_at;
      const fleetAgeSec = calculateLocationAgeSeconds(fleetTimestamp);

      let fleetStatus: ActiveBusData['status'];
      if (!b.is_active || (fleetAgeSec != null && fleetAgeSec > GPS_FRESHNESS_THRESHOLDS.STALE_MAX_SECONDS)) {
        fleetStatus = 'offline';
      } else if (fleetAgeSec != null && fleetAgeSec > GPS_FRESHNESS_THRESHOLDS.LIVE_MAX_SECONDS) {
        fleetStatus = 'stale';
      } else if (rawFleetSpeed != null) {
        fleetStatus = rawFleetSpeed > 1 ? 'moving' : 'stopped';
      } else {
        fleetStatus = 'live';
      }

      list.push({
        id: b.id + 10000,
        busNumber: `Bus #${b.bus_number}`,
        routeName: b.route_name || 'IUBAT Transit Line',
        driverName: b.active_assignment?.driver_name || 'Assigned Driver',
        speed: rawFleetSpeed,
        heading: loc?.heading ? Number(loc.heading) : 165,
        latitude: lat,
        longitude: lng,
        lastUpdated: loc?.timestamp || b.updated_at,
        accentColor: '#00e5ff',
        status: fleetStatus,
        licensePlate: b.license_plate,
      });
    });

    // Note: Fabricated demo buses (UB-001/UB-002) have been permanently removed from production map.

    return list;
  }, [drivers, busesList, followingDriverId]);

  return (
    <BusGisMap
      buses={buses}
      routePath={routePath}
      roadGeometry={roadGeometry}
      stops={stops}
      routeName={routeName}
      originName={originName}
      destinationName={destinationName}
      userPosition={userPosition}
      focusedBusId={focusedDriverId}
      followingBusId={followingDriverId}
      onSelectBus={onSelectDriver}
      heightClass={heightClass}
      showHUD={true}
    />
  );
}
