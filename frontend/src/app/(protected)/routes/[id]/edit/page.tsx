'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { RouteBuilderForm } from '@/components/RouteBuilderForm';
import type { RouteItem } from '@/lib/types';

export default function EditRoutePage() {
  const params = useParams();
  const id = params?.id as string;
  const [route, setRoute] = useState<RouteItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<RouteItem>(`/api/schedules/routes/${id}/`)
      .then(setRoute)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading route...</div>;
  }

  if (!route) {
    return <div className="py-12 text-center text-sm text-red-600">Route not found.</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Edit Route: {route.name}</h1>
        <p className="text-sm text-slate-500">Update route configuration, trips, or pickup points</p>
      </div>
      <RouteBuilderForm existing={route} />
    </div>
  );
}
