'use client';

import React from 'react';
import { RouteBuilderForm } from '@/components/RouteBuilderForm';

export default function NewRoutePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create New Route</h1>
        <p className="text-sm text-slate-500">Build a shuttle, metro, or long-road route</p>
      </div>
      <RouteBuilderForm />
    </div>
  );
}
