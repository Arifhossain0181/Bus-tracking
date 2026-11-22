'use client';

import React, { useMemo } from 'react';
import { isValidCoordinate } from '@/lib/trackingStatus';
import BusGisMap from './BusGisMap';
import type { ActiveBusData } from '@/lib/map3d/threeMapLayer';

interface Props {
  latitude: number | null;
  longitude: number | null;
  busNumber: string;
  trail: [number, number][]; // [latitude, longitude][]
  heightClass?: string;
  heading?: number | null;
  speed?: number | null;
  isAccurate?: boolean;
  routeName?: string;
}

export default function BusFollowMapView({
  latitude,
  longitude,
  busNumber,
  trail,
  heightClass = 'h-[620px]',
  heading = null,
  speed = null,
  routeName,
}: Props) {
  const hasValidCoords = isValidCoordinate(latitude, longitude);

  // Convert single bus into ActiveBusData
  const activeBuses: ActiveBusData[] = useMemo(() => {
    if (!hasValidCoords || latitude == null || longitude == null) return [];
    return [
      {
        id: 9999,
        busNumber: busNumber.startsWith('Bus') ? busNumber : `Bus #${busNumber}`,
        routeName: routeName || 'University Express Follow Line',
        latitude: Number(latitude),
        longitude: Number(longitude),
        heading: heading != null && !isNaN(heading) ? heading : 0,
        speed: speed != null && !isNaN(speed) ? speed : 0,
        accentColor: '#00e5ff',
      },
    ];
  }, [hasValidCoords, latitude, longitude, busNumber, heading, speed, routeName]);

  // Convert trail [lat, lng][] into GeoJSON [lng, lat][]
  const routePath: [number, number][] = useMemo(() => {
    return trail.map(([lat, lng]) => [lng, lat]);
  }, [trail]);

  return (
    <BusGisMap
      buses={activeBuses}
      routePath={routePath.length > 0 ? routePath : undefined}
      followingBusId={hasValidCoords ? 9999 : null}
      focusedBusId={hasValidCoords ? 9999 : null}
      heightClass={heightClass}
      showHUD={true}
      routeName={routeName || 'Campus Transit Follow Mode'}
    />
  );
}
