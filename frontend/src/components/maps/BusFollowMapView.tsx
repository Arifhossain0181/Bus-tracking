'use client';

import React, { useMemo } from 'react';
import { isValidCoordinate, type FollowBusStatus } from '@/lib/trackingStatus';
import BusGisMap from './BusGisMap';
import type { ActiveBusData } from '@/lib/map3d/threeMapLayer';
import type { StopInfo } from '@/lib/map3d/routeGeometry';

interface Props {
  latitude: number | null;
  longitude: number | null;
  busNumber: string;
  trail: [number, number][]; // [latitude, longitude][] historical breadcrumbs
  plannedRouteGeometry?: [number, number][] | null; // GeoJSON [longitude, latitude][]
  stops?: StopInfo[];
  heightClass?: string;
  heading?: number | null;
  speed?: number | null;
  isAccurate?: boolean;
  status?: FollowBusStatus;
  nextStopName?: string | null;
  etaDisplay?: string | null;
  routeName?: string;
}

export default function BusFollowMapView({
  latitude,
  longitude,
  busNumber,
  trail,
  plannedRouteGeometry = null,
  stops = [],
  heightClass = 'h-[620px]',
  heading = null,
  speed = null,
  isAccurate = true,
  status = 'live',
  nextStopName = null,
  etaDisplay = null,
  routeName,
}: Props) {
  const hasValidCoords = isValidCoordinate(latitude, longitude);

  // Map FollowBusStatus ('loading' | 'live' | 'stale' | 'offline' | 'journey_ended' | 'connection_error')
  // to ActiveBusData status ('live' | 'moving' | 'stopped' | 'stale' | 'offline')
  const mappedBusStatus: ActiveBusData['status'] = useMemo(() => {
    if (status === 'stale') return 'stale';
    if (status === 'offline' || status === 'journey_ended' || status === 'connection_error') return 'offline';
    if (speed != null && !isNaN(speed)) {
      return speed > 1 ? 'moving' : 'stopped';
    }
    return 'live';
  }, [status, speed]);

  // Convert single bus into ActiveBusData
  const activeBuses: ActiveBusData[] = useMemo(() => {
    if (!hasValidCoords || latitude == null || longitude == null) return [];
    return [
      {
        id: 9999,
        busNumber: busNumber.startsWith('Bus') ? busNumber : `Bus #${busNumber}`,
        routeName: routeName || (nextStopName ? `Next: ${nextStopName}` : 'Transit Follow Line'),
        latitude: Number(latitude),
        longitude: Number(longitude),
        heading: heading != null && !isNaN(heading) ? heading : 0,
        speed: speed != null && !isNaN(speed) ? speed : null,
        accentColor: '#00e5ff',
        status: mappedBusStatus,
      },
    ];
  }, [hasValidCoords, latitude, longitude, busNumber, heading, speed, routeName, nextStopName, mappedBusStatus]);

  // Dedicated historical breadcrumb trail in GeoJSON [lng, lat][]
  const breadcrumbTrail: [number, number][] = useMemo(() => {
    return (trail || [])
      .filter(([tLat, tLng]) => isValidCoordinate(tLat, tLng))
      .map(([tLat, tLng]) => [tLng, tLat] as [number, number]);
  }, [trail]);

  // Planned route line comes strictly from assigned route/revision geometry or stops
  const plannedRoute: [number, number][] | undefined = useMemo(() => {
    if (plannedRouteGeometry && plannedRouteGeometry.length >= 2) {
      return plannedRouteGeometry;
    }
    if (stops && stops.length >= 2) {
      return stops.map((s) => [s.longitude, s.latitude] as [number, number]);
    }
    return undefined;
  }, [plannedRouteGeometry, stops]);

  return (
    <BusGisMap
      buses={activeBuses}
      routePath={plannedRoute}
      roadGeometry={plannedRouteGeometry && plannedRouteGeometry.length >= 2 ? plannedRouteGeometry : undefined}
      breadcrumbTrail={breadcrumbTrail.length >= 2 ? breadcrumbTrail : undefined}
      stops={stops}
      followingBusId={hasValidCoords ? 9999 : null}
      focusedBusId={hasValidCoords ? 9999 : null}
      heightClass={heightClass}
      showHUD={true}
      routeName={routeName || (nextStopName ? `Next: ${nextStopName}` : 'Campus Transit Follow Mode')}
    />
  );
}
