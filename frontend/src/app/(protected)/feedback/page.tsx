'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import type { Bus, RouteItem } from '@/lib/types';

export default function FeedbackPage() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [category, setCategory] = useState('service');
  const [rating, setRating] = useState(5);
  const [routeId, setRouteId] = useState('');
  const [busId, setBusId] = useState('');
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<RouteItem[]>('/api/schedules/routes/').then(setRoutes).catch(() => {});
    apiFetch<Bus[]>('/api/buses/').then(setBuses).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/api/reports/feedback/submit/', {
        method: 'POST',
        body: JSON.stringify({
          category,
          rating,
          route: routeId ? Number(routeId) : null,
          bus: busId ? Number(busId) : null,
          comment,
          is_anonymous: isAnonymous,
        }),
      });
      setSubmitted(true);
      setComment('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit feedback.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Submit Feedback</h1>
        <p className="text-sm text-slate-500">Help us improve the university bus service</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900">Thank you for your feedback!</h2>
            <p className="text-sm text-slate-500">Your submission has been recorded for transport management.</p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              Submit Another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rating</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="service">Service Quality</option>
                <option value="timing">Timing / Punctuality</option>
                <option value="cleanliness">Cleanliness</option>
                <option value="driver">Driver Behavior</option>
                <option value="app">App / System</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Route (Optional)</label>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Select Route --</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bus (Optional)</label>
                <select
                  value={busId}
                  onChange={(e) => setBusId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Select Bus --</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bus_number}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Comment</label>
              <textarea
                rows={4}
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience or suggestions..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              Submit anonymously
            </label>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
