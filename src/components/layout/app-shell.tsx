"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Bot,
  ClipboardList,
  LayoutDashboard,
  Logs,
  Menu,
  Settings,
  ShieldBan,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushNotifications } from "@/components/notifications/push-notifications";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications, NotificationUnreadProvider } from "@/hooks/use-unread-notifications";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const STATUS_LINKS = [
  { status: "PENDING", label: ar.pending },
  { status: "REVIEWING", label: ar.reviewing },
  { status: "COMPLETED", label: ar.completed },
  { status: "REJECTED", label: ar.rejected },
  { status: "ARCHIVED", label: ar.archived },
] as const;

function sumStatusCounts(counts: Record<string, number>) {
  return STATUS_LINKS.reduce((sum, s) => sum + (counts[s.status] ?? 0), 0);
}

export function AppShell(props: {
  children: React.ReactNode;
  user: { id: string; username: string; displayName: string; role: string };
  requestTypes: { id: string; name: string; slug: string }[];
}) {
  return (
    <NotificationUnreadProvider>
      <AppShellInner {...props} />
    </NotificationUnreadProvider>
  );
}

function AppShellInner({
  children,
  user,
  requestTypes,
}: {
  children: React.ReactNode;
  user: { id: string; username: string; displayName: string; role: string };
  requestTypes: { id: string; name: string; slug: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [serviceTotals, setServiceTotals] = useState<Record<string, number>>({});
  const unreadNotifications = useUnreadNotifications();
  const activeStatus = searchParams.get("status") ?? "PENDING";

  const activeRequestTypeId = (() => {
    if (!pathname.startsWith("/requests/")) return null;
    const raw = pathname.slice("/requests/".length).split(/[/?#]/)[0];
    let segment = raw;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      segment = raw;
    }
    const match = requestTypes.find(
      (rt) => segment === rt.id || segment === rt.slug || segment === `svc-${rt.id}`,
    );
    return match?.id ?? null;
  })();

  useEffect(() => {
    if (user.role !== "ADMIN" || requestTypes.length === 0) {
      setStatusCounts({});
      setServiceTotals({});
      return;
    }
    let cancelled = false;
    async function loadCounts() {
      const totals: Record<string, number> = {};
      await Promise.all(
        requestTypes.map(async (rt) => {
          try {
            const params = new URLSearchParams({
              requestTypeId: rt.id,
              status: "PENDING",
              page: "1",
            });
            const res = await fetch(`/api/orders?${params}`);
            if (!res.ok || cancelled) return;
            const data = await res.json();
            const counts = (data.counts as Record<string, number>) ?? {};
            totals[rt.id] = sumStatusCounts(counts);
            if (rt.id === activeRequestTypeId && !cancelled) {
              setStatusCounts(counts);
            }
          } catch {
            totals[rt.id] = 0;
          }
        }),
      );
      if (!cancelled) setServiceTotals(totals);
    }
    void loadCounts();
    return () => {
      cancelled = true;
    };
  }, [activeRequestTypeId, pathname, requestTypes, searchParams, user.role]);

  const adminNav: NavItem[] = [
    { href: "/dashboard", label: ar.dashboard, icon: LayoutDashboard },
    { href: "/bots", label: ar.bots, icon: Bot },
    { href: "/requests", label: ar.requests, icon: ClipboardList },
    { href: "/groups", label: ar.groups, icon: UsersRound },
    { href: "/blocked-users", label: ar.blockedUsers, icon: ShieldBan },
    { href: "/notifications", label: ar.notifications, icon: Bell },
    { href: "/logs", label: ar.logs, icon: Logs },
    { href: "/settings", label: ar.settings, icon: Settings },
  ];

  const superNav: NavItem[] = [
    { href: "/users", label: ar.users, icon: Users },
    { href: "/settings", label: ar.settings, icon: Settings },
  ];

  const nav = user.role === "SUPER_ADMIN" ? superNav : adminNav;

  useEffect(() => setOpen(false), [pathname, searchParams]);

  useEffect(() => {
    if (user.role === "SUPER_ADMIN" && !pathname.startsWith("/users") && !pathname.startsWith("/settings")) {
      router.replace("/users");
    }
    if (user.role === "ADMIN" && pathname.startsWith("/users")) {
      router.replace("/dashboard");
    }
  }, [pathname, router, user.role]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const Sidebar = (
    <aside className="flex h-full w-72 flex-col bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-b border-white/10 px-5 py-5">
        <div className="text-xl font-bold tracking-tight">{ar.brand}</div>
        <div className="mt-1 text-xs text-white/70">{ar.tagline}</div>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showUnread = item.href === "/notifications" && unreadNotifications > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                active ? "bg-white/15" : "hover:bg-white/10",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {showUnread ? (
                <span className={cn("tabular-nums text-xs", active ? "text-white/80" : "text-white/50")}>
                  {unreadNotifications}
                </span>
              ) : null}
            </Link>
          );
        })}
        {user.role === "ADMIN" && requestTypes.length > 0 && (
          <div className="space-y-1 border-t border-white/10 pt-4">
            {requestTypes.map((rt) => {
              const href = `/requests/${rt.id}`;
              const isActive = activeRequestTypeId === rt.id;
              const totalOrders = serviceTotals[rt.id] ?? (isActive ? sumStatusCounts(statusCounts) : 0);
              return (
                <div key={rt.id} className="mb-1">
                  <Link
                    href={`${href}?status=PENDING`}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                      isActive ? "bg-accent text-accent-foreground" : "hover:bg-white/10",
                    )}
                  >
                    <span>{rt.name}</span>
                    <span
                      className={cn(
                        "tabular-nums text-xs",
                        isActive ? "text-accent-foreground/80" : "text-white/50",
                      )}
                    >
                      {totalOrders}
                    </span>
                  </Link>
                  {isActive && (
                    <div className="ms-2 mt-1.5 space-y-1 border-s border-white/20 ps-2">
                      <div className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-white/80">
                        <span>{ar.all}</span>
                        <span className="tabular-nums font-medium">{totalOrders}</span>
                      </div>
                      {STATUS_LINKS.map((s) => {
                        const statusActive = activeStatus === s.status;
                        const count = statusCounts[s.status] ?? 0;
                        return (
                          <Link
                            key={s.status}
                            href={`${href}?status=${s.status}`}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition",
                              statusActive
                                ? "bg-white font-semibold text-sidebar shadow-sm"
                                : "text-white/65 hover:bg-white/10 hover:text-white",
                            )}
                          >
                            <span>{s.label}</span>
                            <span
                              className={cn(
                                "tabular-nums",
                                statusActive ? "text-sidebar/70" : "text-white/45",
                              )}
                            >
                              {count}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>
      <div className="shrink-0 border-t border-white/10 p-4 text-sm">
        <div className="font-medium">{user.displayName}</div>
        <div className="text-xs text-white/60">@{user.username}</div>
        <Button variant="ghost" className="mt-3 w-full text-sidebar-foreground" loading={loggingOut} onClick={logout}>
          {loggingOut ? ar.loading : ar.logout}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden h-full shrink-0 lg:block">{Sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 z-50 h-full">{Sidebar}</div>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="lg:hidden" onClick={() => setOpen(true)} aria-label={ar.menu}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="font-semibold">{ar.brand}</div>
          </div>
          {user.role === "ADMIN" ? <NotificationBell /> : <span />}
        </header>
        {user.role === "ADMIN" ? <PushNotifications /> : null}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
          <motion.div
            key={`${pathname}?${searchParams.toString()}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
