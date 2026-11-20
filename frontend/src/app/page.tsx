'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bus,
  ShieldCheck,
  Building2,
  Radio,
  GraduationCap,
  MapPin,
  Route,
  CalendarDays,
  ArrowRight,
  Sparkles,
  Users,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { isRegularUser } from '@/lib/api';

interface RoleCard {
  id: string;
  roleKey: string;
  title: string;
  tagline: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  accentBg: string;
  buttonClass: string;
  description: string;
  highlights: string[];
}

const ROLES: RoleCard[] = [
  {
    id: 'admin',
    roleKey: 'admin',
    title: 'Fleet Administrator',
    tagline: 'System operations, fleet control & resource provisioning',
    badge: 'Full Control',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: <ShieldCheck className="w-7 h-7 text-rose-600" />,
    accentBg: 'from-rose-500/10 via-rose-500/5 to-transparent',
    buttonClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200',
    description:
      'Manage buses, build and edit routes, assign drivers to shifts, approve new student/faculty accounts, and oversee system reports.',
    highlights: ['Add & configure buses', 'Route builder & stops', 'Driver shift assignments', 'Approve registrations'],
  },
  {
    id: 'authority',
    roleKey: 'authority',
    title: 'University Authority',
    tagline: 'Oversight, punctuality monitoring & compliance',
    badge: 'Monitoring',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: <Building2 className="w-7 h-7 text-indigo-600" />,
    accentBg: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200',
    description:
      'Monitor live transit operations, evaluate driver performance logs, review journey paths, and inspect incident reports.',
    highlights: ['Operational overview', 'Punctuality analytics', 'Historical GPS replay', 'Incident management'],
  },
  {
    id: 'driver',
    roleKey: 'driver',
    title: 'Bus Driver',
    tagline: 'Journey console, GPS sharing & roadside alerts',
    badge: 'Live Operations',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
    icon: <Radio className="w-7 h-7 text-amber-600" />,
    accentBg: 'from-amber-500/10 via-amber-500/5 to-transparent',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200',
    description:
      'Start scheduled trips, broadcast real-time GPS location from your mobile device, flag traffic delays, and report breakdowns.',
    highlights: ['One-tap live GPS sharing', 'Start / End assigned trip', 'Report breakdown or delay', 'View active route'],
  },
  {
    id: 'student',
    roleKey: 'student',
    title: 'Student / Faculty / Staff',
    tagline: 'Campus commuters, live tracking & schedules',
    badge: 'Passenger',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <GraduationCap className="w-7 h-7 text-blue-600" />,
    accentBg: 'from-blue-500/10 via-blue-500/5 to-transparent',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200',
    description:
      'Explore live interactive bus map, check upcoming shuttle and metro schedules, calculate stop ETAs, and submit service feedback.',
    highlights: ['Interactive live bus map', 'Shuttle & express schedules', 'Estimated arrival times', 'Submit trip feedback'],
  },
];

export default function HomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-96 left-1/4 w-[400px] h-[400px] bg-rose-600/10 blur-3xl rounded-full" />
        <div className="absolute top-96 right-1/4 w-[400px] h-[400px] bg-amber-600/10 blur-3xl rounded-full" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <Bus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white tracking-tight">UBus Tracker</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Campus Fleet
                </span>
              </div>
              <p className="text-[11px] text-slate-400">University Bus Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!loading && user ? (
              <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-1.5">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-white">{user.full_name || user.username}</div>
                  <div className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">{user.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(isRegularUser(user.role) ? '/schedules' : '/dashboard')}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition"
                  title="Sign out"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/register"
                  className="hidden sm:inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  New Registration
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Select Your Access Role Below</span>
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400">UBus Portal</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Choose your designated portal to access live bus tracking, route planning, fleet administration, or driver trip controls.
          </p>

          {/* Quick Stats Bar */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-left">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                <Bus className="w-3.5 h-3.5 text-blue-400" />
                <span>Active Fleet</span>
              </div>
              <div className="text-lg font-bold text-white">10 Buses</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                <Route className="w-3.5 h-3.5 text-emerald-400" />
                <span>Routes</span>
              </div>
              <div className="text-lg font-bold text-white">4 Active</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
                <span>Daily Trips</span>
              </div>
              <div className="text-lg font-bold text-white">60+ Trips</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>Coverage</span>
              </div>
              <div className="text-lg font-bold text-white">Campus & City</div>
            </div>
          </div>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ROLES.map((role) => (
            <div
              key={role.id}
              className={`group relative rounded-2xl bg-gradient-to-b ${role.accentBg} bg-slate-900/80 border border-slate-800/90 hover:border-slate-700 p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/60`}
            >
              <div>
                {/* Header: Icon & Badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                    {role.icon}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${role.badgeColor}`}>
                    {role.badge}
                  </span>
                </div>

                {/* Title & Tagline */}
                <h2 className="text-lg font-bold text-white mb-1 group-hover:text-blue-300 transition-colors">
                  {role.title}
                </h2>
                <p className="text-xs text-slate-400 mb-3">{role.tagline}</p>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">{role.description}</p>

                {/* Highlights List */}
                <div className="space-y-1.5 pt-3 border-t border-slate-800/80 mb-6">
                  {role.highlights.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <Link
                  href={`/login?role=${role.roleKey}`}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition ${role.buttonClass}`}
                >
                  <span>Enter as {role.title.split(' ')[0]}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Public Quick Access */}
        <div className="mt-12 text-center">
          <p className="text-xs text-slate-400 mb-3">Looking to check schedules or routes without logging in first?</p>
          <div className="inline-flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?role=student&redirect=/live-map"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>Live Interactive Map</span>
            </Link>
            <Link
              href="/login?role=student&redirect=/schedules"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <CalendarDays className="w-3.5 h-3.5 text-emerald-400" />
              <span>Bus Timetables & Schedules</span>
            </Link>
            <Link
              href="/contributors"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>Project Team & Contributors</span>
            </Link>
            <a
              href="http://localhost:8000/admin/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <span>Django Backend Admin</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            &copy; 2026 UBus Transit System &middot; Developed by{' '}
            <Link href="/contributors" className="text-slate-300 hover:text-white font-semibold underline">
              Md. Taher Bin Omar Hijbullah
            </Link>{' '}
            & Team
          </div>
          <div className="flex items-center gap-4 text-slate-400 text-xs">
            <span>Branch: <strong className="text-blue-400 font-mono">hij_dev</strong></span>
            <span>&bull;</span>
            <Link href="/register" className="hover:text-white">Register Account</Link>
            <span>&bull;</span>
            <Link href="/login" className="hover:text-white">Direct Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
