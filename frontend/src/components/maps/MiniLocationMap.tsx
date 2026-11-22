'use client';

import React, { useMemo } from 'react';
import Map3DView from './Map3DView';
import type { ActiveBusData } from '@/lib/map3d/threeMapLayer';

interface Props {
  latitude: number | null;
  longitude: number | null;
  heightClass?: string;
}

export default function MiniLocationMap({
  latitude,
  longitude,
  heightClass = 'h-72',
}: Props) {
  const buses: ActiveBusData[] = useMemo(() => {
    if (latitude == null || longitude == null) return [];
    return [
      {
        id: 1001,
        busNumber: 'MY GPS',
        routeName: 'Broadcasting Live Location',
        latitude,
        longitude,
        speed: 0,
        heading: 0,
        accentColor: '#10b981',
      },
    ];
  }, [latitude, longitude]);

  return (
    <div className="relative w-full">
      <Map3DView
        buses={buses}
        userPosition={latitude != null && longitude != null ? [latitude, longitude] : null}
        focusedBusId={latitude != null && longitude != null ? 1001 : null}
        heightClass={heightClass}
        showOverlayCards={false}
      />
    </div>
  );
}
