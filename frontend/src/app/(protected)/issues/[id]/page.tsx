'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, MessageSquare, UserCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api';
import type { Issue } from '@/lib/types';

export default function IssueDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const id = params?.id as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comment, setComment] = useState('');
  const [statusVal, setStatusVal] = useState('');
  const [priorityVal, setPriorityVal] = useState('');
  const [notesVal, setNotesVal] = useState('');
  const [loading, setLoading] = useState(true);

  const loadIssue = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<Issue>(`/api/issues/${id}/`);
      setIssue(data);
      setStatusVal(data.status);
      setPriorityVal(data.priority);
      setNotesVal(data.resolution_notes || '');
    } catch {
      setIssue(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadIssue();
  }, [loadIssue]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !issue) return;
    await apiFetch(`/api/issues/${issue.id}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ comment: comment.trim() }),
    });
    setComment('');
    loadIssue();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue) return;
    await apiFetch(`/api/issues/${issue.id}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: statusVal,
        priority: priorityVal,
        resolution_notes: notesVal,
      }),
    });
    loadIssue();
  };

  const handleAssign = async () => {
    if (!issue) return;
    await apiFetch(`/api/issues/${issue.id}/assign/`, { method: 'POST' });
    loadIssue();
  };

  const handleResolve = async () => {
    if (!issue) return;
    await apiFetch(`/api/issues/${issue.id}/resolve/`, {
      method: 'POST',
      body: JSON.stringify({ resolution_notes: notesVal }),
    });
    loadIssue();
  };

  if (loading) return <div className="py-12 text-center text-sm text-slate-500">Loading issue...</div>;
  if (!issue) return <div className="py-12 text-center text-sm text-red-600">Issue not found.</div>;

  const canManage = user?.role === 'admin' || user?.role === 'authority';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/issues" className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Issue #{issue.id}: {issue.issue_type_display}
            </h1>
            <p className="text-xs text-slate-500">
              Reported by {issue.reported_by_name} on {new Date(issue.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {canManage && issue.status !== 'resolved' && (
          <div className="flex gap-2">
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={handleAssign}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Assign to Me
              </button>
            )}
            <button
              type="button"
              onClick={handleResolve}
              className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 inline-flex items-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark Resolved
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold">
                Status: {issue.status_display}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold capitalize">
                Priority: {issue.priority}
              </span>
              {issue.bus_number && (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  Bus: {issue.bus_number}
                </span>
              )}
              {issue.route_name && (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  Route: {issue.route_name}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">
              {issue.description || 'No description provided.'}
            </p>
            {issue.resolution_notes && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
                <strong>Resolution Notes:</strong> {issue.resolution_notes}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              Comments ({issue.comments.length})
            </h2>

            <div className="space-y-3">
              {issue.comments.map((c) => (
                <div key={c.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <strong className="text-slate-800">{c.user_name}</strong>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-700">{c.comment}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleComment} className="flex gap-2">
              <input
                type="text"
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
              >
                Post
              </button>
            </form>
          </div>
        </div>

        {/* Admin/Authority update sidebar */}
        {canManage && (
          <form onSubmit={handleUpdate} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3 h-fit">
            <h2 className="font-bold text-slate-900">Manage Issue</h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={priorityVal}
                onChange={(e) => setPriorityVal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Resolution Notes</label>
              <textarea
                rows={3}
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              Update Issue
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
