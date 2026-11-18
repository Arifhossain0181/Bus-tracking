'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { NotificationItem } from '@/lib/types';

export default function NotificationDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [notification, setNotification] = useState<NotificationItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<NotificationItem>(`/api/notifications/${id}/`)
      .then(setNotification)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-500">Loading...</div>;
  if (!notification) return <div className="py-12 text-center text-sm text-red-600">Notification not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link
        href="/notifications"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Notifications
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">{notification.title}</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 capitalize">
            {notification.priority}
          </span>
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {notification.message}
        </p>
        <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap gap-4">
          <span>Sent by: {notification.created_by_name || 'System'}</span>
          <span>Target: {notification.target}</span>
          <span>Date: {new Date(notification.created_at).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
