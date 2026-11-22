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
  iconBg: string;
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
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: <ShieldCheck className="w-6 h-6 text-rose-600" />,
    iconBg: 'bg-rose-50 border-rose-100',
    buttonClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-200',
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
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: <Building2 className="w-6 h-6 text-indigo-600" />,
    iconBg: 'bg-indigo-50 border-indigo-100',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200',
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
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: <Radio className="w-6 h-6 text-amber-600" />,
    iconBg: 'bg-amber-50 border-amber-100',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-200',
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
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: <GraduationCap className="w-6 h-6 text-blue-600" />,
    iconBg: 'bg-blue-50 border-blue-100',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200',
    description:
      'Explore live interactive bus map, check upcoming shuttle and metro schedules, calculate stop ETAs, and submit service feedback.',
    highlights: ['Interactive live bus map', 'Shuttle & express schedules', 'Estimated arrival times', 'Submit trip feedback'],
  },
];

export default function HomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-slate-800 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Navbar matching AppShell theme */}
      <header className="sticky top-0 z-40 bg-blue-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Bus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white tracking-tight">UBus Tracker</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white border border-white/30">
                  Campus Fleet
                </span>
              </div>
              <p className="text-[11px] text-blue-100">University Bus Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!loading && user ? (
              <div className="flex items-center gap-3 bg-blue-700/80 border border-blue-500 rounded-xl px-3 py-1.5">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-white">{user.full_name || user.username}</div>
                  <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">{user.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(isRegularUser(user.role) ? '/schedules' : '/dashboard')}
                  className="px-3 py-1.5 rounded-lg bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold shadow-sm transition"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 text-blue-100 text-xs font-medium transition"
                  title="Sign out"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/register"
                  className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-medium text-white/90 hover:text-white hover:bg-blue-500 transition"
                >
                  New Registration
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-white text-blue-600 hover:bg-blue-50 shadow-sm transition"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-4 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Select Your Access Role Below</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-3 leading-tight">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">UBus Portal</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Choose your designated portal to access live bus tracking, route planning, fleet administration, or driver trip controls.
          </p>

          {/* Quick Stats Bar */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-left">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
                <Bus className="w-3.5 h-3.5 text-blue-600" />
                <span>Active Fleet</span>
              </div>
              <div className="text-lg font-bold text-slate-900">10 Buses</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
                <Route className="w-3.5 h-3.5 text-emerald-600" />
                <span>Routes</span>
              </div>
              <div className="text-lg font-bold text-slate-900">4 Active</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                <span>Daily Trips</span>
              </div>
              <div className="text-lg font-bold text-slate-900">60+ Trips</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>Coverage</span>
              </div>
              <div className="text-lg font-bold text-slate-900">Campus & City</div>
            </div>
          </div>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ROLES.map((role) => (
            <div
              key={role.id}
              className="group relative rounded-2xl bg-white border border-slate-200 hover:border-blue-400 p-6 flex flex-col justify-between shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div>
                {/* Header: Icon & Badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl border ${role.iconBg} flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform`}>
                    {role.icon}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${role.badgeColor}`}>
                    {role.badge}
                  </span>
                </div>

                {/* Title & Tagline */}
                <h2 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                  {role.title}
                </h2>
                <p className="text-xs text-slate-500 mb-3">{role.tagline}</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">{role.description}</p>

                {/* Highlights List */}
                <div className="space-y-1.5 pt-3 border-t border-slate-100 mb-6">
                  {role.highlights.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <Link
                  href={`/login?role=${role.roleKey}`}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition ${role.buttonClass}`}
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
          <p className="text-xs text-slate-500 mb-3 font-medium">Looking to check schedules or routes without logging in first?</p>
          <div className="inline-flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?role=student&redirect=/live-map"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:border-blue-300 shadow-xs transition"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Live Interactive Map</span>
            </Link>
            <Link
              href="/login?role=student&redirect=/schedules"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:border-blue-300 shadow-xs transition"
            >
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bus Timetables & Schedules</span>
            </Link>
            <Link
              href="/contributors"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:border-blue-300 shadow-xs transition"
            >
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>Project Team & Contributors</span>
            </Link>
            <a
              href="/admin/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:border-blue-300 shadow-xs transition"
            >
              <span>Django Backend Admin</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            &copy; 2026 UBus Transit System &middot; Developed by{' '}
            <Link href="/contributors" className="text-slate-800 hover:text-blue-600 font-semibold underline">
              Md. Taher Bin Omar Hijbullah
            </Link>{' '}
            & Team
          </div>
          <div className="flex items-center gap-4 text-slate-500 text-xs">
            <span>Branch: <strong className="text-blue-600 font-mono">hij_dev</strong></span>
            <span>&bull;</span>
            <Link href="/register" className="hover:text-blue-600">Register Account</Link>
            <span>&bull;</span>
            <Link href="/login" className="hover:text-blue-600">Direct Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
