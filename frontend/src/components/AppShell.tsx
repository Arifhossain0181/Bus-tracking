'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Bus,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Radio,
  Route,
  Send,
  UserCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { apiFetch, isRegularUser } from '@/lib/api';
import type { UnreadNotification } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [unread, setUnread] = useState<UnreadNotification[]>([]);

  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch<UnreadNotification[]>('/api/notifications/unread/');
      setUnread(Array.isArray(data) ? data : []);
    } catch {
      // ignore background polling errors
    }
  }, [user]);

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [loadUnread]);

  const dismissNotification = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/dismiss/`, { method: 'POST' });
      setUnread((prev) => prev.filter((n) => n.notification_id !== id));
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const role = user?.role;
  const regular = isRegularUser(role);

  const primaryLinks: NavItem[] = [
    ...(!regular
      ? [{ href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> }]
      : []),
    { href: '/live-map', label: 'Live Map', icon: <MapPin className="w-4 h-4" /> },
    { href: '/routes', label: 'Routes', icon: <Route className="w-4 h-4" /> },
    { href: '/schedules', label: 'Schedules', icon: <CalendarDays className="w-4 h-4" /> },
    ...(regular || role === 'authority'
      ? [{ href: '/buses', label: 'Buses', icon: <Bus className="w-4 h-4" /> }]
      : []),
  ];

  const driverLinks: NavItem[] =
    role === 'driver'
      ? [
          { href: '/share-location', label: 'Share Location', icon: <Radio className="w-4 h-4" /> },
          { href: '/issues/new', label: 'Report Issue', icon: <AlertCircle className="w-4 h-4" /> },
          { href: '/issues', label: 'My Issues', icon: <ClipboardList className="w-4 h-4" /> },
        ]
      : [];

  const adminLinks: NavItem[] =
    role === 'admin'
      ? [
          { href: '/buses', label: 'Buses', icon: <Bus className="w-4 h-4" /> },
          { href: '/buses/assignments', label: 'Assignments', icon: <ClipboardList className="w-4 h-4" /> },
          { href: '/drivers', label: 'Drivers', icon: <Users className="w-4 h-4" /> },
          { href: '/journey-history', label: 'Journey History', icon: <History className="w-4 h-4" /> },
          { href: '/users', label: 'Users', icon: <Users className="w-4 h-4" /> },
          {
            href: '/pending',
            label: 'Registrations',
            icon: <UserCheck className="w-4 h-4" />,
            badge: user?.pending_registrations_count || 0,
          },
          { href: '/issues', label: 'Issues', icon: <AlertCircle className="w-4 h-4" /> },
          { href: '/notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
          { href: '/reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
        ]
      : [];

  const authorityLinks: NavItem[] =
    role === 'authority'
      ? [
          { href: '/reports', label: 'Reports & Analytics', icon: <BarChart3 className="w-4 h-4" /> },
          { href: '/journey-history', label: 'Journey History', icon: <History className="w-4 h-4" /> },
          { href: '/users', label: 'Users', icon: <Users className="w-4 h-4" /> },
          { href: '/issues', label: 'Issues', icon: <AlertCircle className="w-4 h-4" /> },
          { href: '/notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
        ]
      : [];

  const feedbackLinks: NavItem[] =
    regular || role === 'driver'
      ? [
          { href: '/feedback', label: 'Submit Feedback', icon: <MessageSquare className="w-4 h-4" /> },
          { href: '/notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
        ]
      : [];

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderSection = (title: string | null, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        {title && (
          <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {title}
          </div>
        )}
        <div className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              <span className="flex items-center gap-2.5">
                {item.icon}
                {item.label}
              </span>
              {item.badge && item.badge > 0 ? (
                <span className="px-2 py-0.5 text-xs font-bold bg-amber-400 text-slate-900 rounded-full">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-blue-600 text-white shadow-md">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden p-1.5 rounded-md hover:bg-blue-500 transition-colors"
              aria-label="Toggle Menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link
              href={regular ? '/schedules' : '/dashboard'}
              className="flex items-center gap-2 font-bold text-lg tracking-tight"
            >
              <Bus className="w-6 h-6" />
              <span>UBus Tracker</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setUserMenuOpen(false);
                }}
                className="relative p-2 rounded-lg hover:bg-blue-500 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unread.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
                    {unread.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-sm">Unread Notifications</span>
                    <Link
                      href="/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {unread.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        No new notifications
                      </div>
                    ) : (
                      unread.slice(0, 6).map((n) => (
                        <div
                          key={n.notification_id}
                          className="p-3 hover:bg-slate-50 flex items-start justify-between gap-2"
                        >
                          <Link
                            href={`/notifications/${n.notification_id}`}
                            onClick={() => setNotifOpen(false)}
                            className="flex-1 min-w-0"
                          >
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {n.title}
                            </p>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                              {n.message}
                            </p>
                          </Link>
                          <button
                            type="button"
                            onClick={() => dismissNotification(n.notification_id)}
                            className="p-1 text-slate-400 hover:text-slate-700"
                            title="Dismiss"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
              >
                <UserCircle className="w-5 h-5" />
                <span className="hidden sm:inline">{user?.username}</span>
                <span className="hidden md:inline text-[11px] bg-blue-800/70 px-2 py-0.5 rounded-full capitalize">
                  {user?.role}
                </span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold truncate">{user?.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize">{user?.role_display}</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    <UserCircle className="w-4 h-4 text-slate-500" />
                    Profile
                  </Link>
                  {role === 'admin' && (
                    <Link
                      href="/notifications"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"
                    >
                      <Send className="w-4 h-4 text-slate-500" />
                      Send Notification
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Body with Sidebar */}
      <div className="flex flex-1 relative">
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 top-14 z-30 w-64 bg-slate-50 border-r border-slate-200 p-3 overflow-y-auto transition-transform duration-200 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {renderSection('Navigation', primaryLinks)}
          {renderSection('Driver Tools', driverLinks)}
          {renderSection('Management', adminLinks)}
          {renderSection('Authority Oversight', authorityLinks)}
          {renderSection('Feedback & Alerts', feedbackLinks)}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>

      {/* Footer */}
      <footer className="bg-slate-800 text-slate-300 py-3 px-4 text-center text-sm">
        &copy; 2026 Md. Taher Bin Omar Hijbullah and his{' '}
        <Link href="/contributors" className="text-white font-semibold hover:underline">
          Team
        </Link>
      </footer>
    </div>
  );
}
