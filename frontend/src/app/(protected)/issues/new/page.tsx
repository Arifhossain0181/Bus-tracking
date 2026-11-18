'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';

export default function NewIssuePage() {
  const router = useRouter();
  const [issueType, setIssueType] = useState('mechanical');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const captureGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(7));
        setLongitude(pos.coords.longitude.toFixed(7));
      },
      () => setError('Could not retrieve GPS location.')
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/api/issues/create/', {
        method: 'POST',
        body: JSON.stringify({
          issue_type: issueType,
          description,
          latitude: latitude || null,
          longitude: longitude || null,
        }),
      });
      router.push('/issues');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit issue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Report an Issue</h1>
        <p className="text-sm text-slate-500">
          Your active bus and route assignment will be automatically attached
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Issue Category *</label>
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="mechanical">Mechanical Breakdown</option>
            <option value="traffic">Heavy Traffic Delay</option>
            <option value="emergency">Emergency</option>
            <option value="accident">Accident</option>
            <option value="weather">Weather Related</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            rows={4}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">GPS Coordinates (Optional)</label>
            <button
              type="button"
              onClick={captureGps}
              className="text-xs text-blue-600 font-semibold inline-flex items-center gap-1 hover:underline"
            >
              <MapPin className="w-3.5 h-3.5" />
              Use Current Location
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Latitude"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <input
              type="text"
              placeholder="Longitude"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-900 font-bold rounded-lg text-sm"
        >
          {submitting ? 'Submitting...' : 'Submit Issue Report'}
        </button>
      </form>
    </div>
  );
}
