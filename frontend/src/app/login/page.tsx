'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bus,
  Lock,
  User as UserIcon,
  ShieldCheck,
  Building2,
  Radio,
  GraduationCap,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ApiError, isRegularUser } from '@/lib/api';

const ROLE_INFO: Record<
  string,
  { label: string; badge: string; color: string; icon: React.ReactNode; user: string; pass: string }
> = {
  admin: {
    label: 'Fleet Administrator',
    badge: 'Admin Portal',
    color: 'from-rose-600 to-red-700',
    icon: <ShieldCheck className="w-5 h-5 text-rose-400" />,
    user: 'admin',
    pass: 'admin123',
  },
  authority: {
    label: 'University Authority',
    badge: 'Authority Portal',
    color: 'from-indigo-600 to-blue-700',
    icon: <Building2 className="w-5 h-5 text-indigo-400" />,
    user: 'authority',
    pass: 'authority123',
  },
  driver: {
    label: 'Campus Bus Driver',
    badge: 'Driver Portal',
    color: 'from-amber-600 to-orange-700',
    icon: <Radio className="w-5 h-5 text-amber-300" />,
    user: 'driver1',
    pass: 'driver123',
  },
  student: {
    label: 'Student / Faculty / Staff',
    badge: 'Commuter Portal',
    color: 'from-blue-600 to-indigo-700',
    icon: <GraduationCap className="w-5 h-5 text-blue-300" />,
    user: 'student1',
    pass: 'student123',
  },
};

function LoginForm() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const roleParam = (searchParams.get('role') || '').toLowerCase();
  const initialUsername = searchParams.get('username') || '';
  const redirectParam = searchParams.get('redirect') || '';

  const activeRoleInfo = ROLE_INFO[roleParam];

  const [username, setUsername] = useState(initialUsername || activeRoleInfo?.user || '');
  const [password, setPassword] = useState(activeRoleInfo?.pass || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (redirectParam) {
        router.replace(redirectParam);
      } else {
        router.replace(isRegularUser(user.role) ? '/schedules' : '/dashboard');
      }
    }
  }, [user, loading, router, redirectParam]);

  const handleFillDemo = (roleKey: string) => {
    const creds = ROLE_INFO[roleKey];
    if (creds) {
      setUsername(creds.user);
      setPassword(creds.pass);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedInUser = await login(username.trim(), password);
      if (redirectParam) {
        router.replace(redirectParam);
      } else {
        router.replace(isRegularUser(loggedInUser.role) ? '/schedules' : '/dashboard');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const headerGradient = activeRoleInfo ? activeRoleInfo.color : 'from-blue-600 via-blue-700 to-indigo-800';

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
      {/* Header */}
      <div className={`bg-gradient-to-br ${headerGradient} px-6 pt-7 pb-6 text-center text-white relative`}>
        <Link
          href="/"
          className="absolute left-4 top-4 inline-flex items-center gap-1 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Portals</span>
        </Link>

        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-inner">
          <Bus className="w-8 h-8 text-white" />
        </div>

        {activeRoleInfo ? (
          <div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/20 text-white mb-1.5">
              {activeRoleInfo.icon}
              {activeRoleInfo.badge}
            </span>
            <h1 className="text-xl font-bold">{activeRoleInfo.label}</h1>
            <p className="text-white/80 text-xs mt-0.5">Enter your credentials to access your portal</p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold">UBus Sign In</h1>
            <p className="text-blue-100 text-xs mt-1">University Bus Tracking & Management System</p>
          </div>
        )}
      </div>

      {/* Quick Role Switcher Pills */}
      <div className="bg-slate-100/90 border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 overflow-x-auto gap-1">
        <span className="text-[11px] font-medium text-slate-500 shrink-0">Switch:</span>
        <div className="flex gap-1">
          {Object.entries(ROLE_INFO).map(([key]) => {
            const isActive = roleParam === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  handleFillDemo(key);
                  router.push(`/login?role=${key}`);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition shrink-0 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                {key === 'student' ? 'Student' : key === 'authority' ? 'Authority' : key === 'admin' ? 'Admin' : 'Driver'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs leading-relaxed">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
            Username
          </label>
          <div className="relative">
            <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin, driver1, student1"
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Password
            </label>
            <span className="text-[11px] text-slate-400">(or University ID)</span>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>
        </div>

        {/* 1-Click Demo Fill Button */}
        {activeRoleInfo && (
          <button
            type="button"
            onClick={() => handleFillDemo(roleParam)}
            className="w-full py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium flex items-center justify-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Fill Demo Credentials ({activeRoleInfo.user} / {activeRoleInfo.pass})</span>
          </button>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-xl transition-all shadow-md shadow-blue-500/20 text-sm"
        >
          {submitting ? 'Authenticating...' : 'Sign In to Portal'}
        </button>

        <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
          New commuter without account?{' '}
          <Link href="/register" className="text-blue-600 font-semibold hover:underline">
            Register here
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <div className="flex-1 flex items-center justify-center p-4">
        <Suspense
          fallback={
            <div className="w-full max-w-md h-96 bg-slate-900/50 rounded-3xl animate-pulse flex items-center justify-center text-slate-400 text-sm">
              Loading Portal...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>

      <footer className="py-4 text-center text-xs text-slate-500">
        &copy; 2026 Md. Taher Bin Omar Hijbullah and his{' '}
        <Link href="/contributors" className="underline font-semibold text-slate-300 hover:text-white">
          Team
        </Link>{' '}
        &middot;{' '}
        <Link href="/" className="hover:text-slate-300">
          Back to Role Selection
        </Link>
      </footer>
    </div>
  );
}
