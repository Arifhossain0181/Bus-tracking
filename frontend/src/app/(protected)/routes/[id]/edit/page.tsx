'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Map } from 'lucide-react';
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

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-950 shadow-sm">
        <div>
          <span className="font-bold text-sm text-indigo-900 block flex items-center gap-1.5">
            <Map className="w-4 h-4 text-indigo-600" />
            Visual Route Builder
          </span>
          <span className="text-indigo-800">
            Edit road geometry, draw shaping points on the map, and manage versioned route revisions.
          </span>
        </div>
        <Link
          href={`/routes/${route.id}/builder`}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
        >
          Open Route Builder &rarr;
        </Link>
      </div>

      <RouteBuilderForm existing={route} />
    </div>
  );
}
