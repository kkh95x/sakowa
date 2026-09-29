"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bot,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
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
import { badgeDotClass } from "@/components/ui/badge";
import { statusTone } from "@/components/orders/status-badge";
import { useUnreadNotifications, NotificationUnreadProvider } from "@/hooks/use-unread-notifications";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { label: string; items: NavItem[] };

const STATUS_LINKS = [
  { status: "PENDING", label: ar.pending },
  { status: "REVIEWING", label: ar.reviewing },
  { status: "IN_PROGRESS", label: ar.inProgress },
  { status: "RESOLVED", label: ar.resolved },
  { status: "REJECTED", label: ar.rejected },
  { status: "CLOSED", label: ar.closed },
] as const;

function sumStatusCounts(counts: Record<string, number>) {
  return STATUS_LINKS.reduce((sum, s) => sum + (counts[s.status] ?? 0), 0);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
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

  const adminGroups: NavGroup[] = [
    {
      label: ar.navOperations,
      items: [
        { href: "/dashboard", label: ar.dashboard, icon: LayoutDashboard },
        { href: "/requests", label: ar.requests, icon: FolderKanban },
        { href: "/bots", label: ar.bots, icon: Bot },
      ],
    },
    {
      label: ar.navFollowUp,
      items: [
        { href: "/notifications", label: ar.notifications, icon: Bell },
        { href: "/groups", label: ar.groups, icon: UsersRound },
        { href: "/blocked-users", label: ar.blockedUsers, icon: ShieldBan },
      ],
    },
    {
      label: ar.navAdministration,
      items: [
        { href: "/logs", label: ar.logs, icon: Logs },
        { href: "/settings", label: ar.settings, icon: Settings },
      ],
    },
  ];

  const superGroups: NavGroup[] = [
    {
      label: ar.navAdministration,
      items: [
        { href: "/users", label: ar.users, icon: Users },
        { href: "/settings", label: ar.settings, icon: Settings },
      ],
    },
  ];

  const groups = user.role === "SUPER_ADMIN" ? superGroups : adminGroups;

  const pageTitle = (() => {
    if (activeRequestTypeId) return requestTypes.find((rt) => rt.id === activeRequestTypeId)?.name ?? ar.navComplaints;
    if (pathname.startsWith("/complaints/") || pathname.startsWith("/orders/")) return ar.complaintDetails;
    for (const g of groups) {
      const hit = g.items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
      if (hit) return hit.label;
    }
    return ar.brand;
  })();

  useEffect(() => setOpen(false), [pathname, searchParams]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  function renderItem(item: NavItem) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const showUnread = item.href === "/notifications" && unreadNotifications > 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-lg px-2.5 text-sm transition-colors",
          active ? "bg-primary-soft font-medium text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate">{item.label}</span>
        </span>
        {showUnread ? (
          <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums">
            {unreadNotifications}
          </span>
        ) : null}
      </Link>
    );
  }

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-e border-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-card">
          <img src="/logo.jpg" alt="" className="size-full scale-150 object-cover" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight">{ar.brand}</div>
          <div className="truncate text-[11px] text-muted-foreground">{ar.tagline}</div>
        </div>
      </div>

      <nav aria-label={ar.menu} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
        {groups.slice(0, 1).map((g) => (
          <NavSection key={g.label} label={g.label}>
            {g.items.map(renderItem)}
          </NavSection>
        ))}

        {user.role === "ADMIN" && requestTypes.length > 0 ? (
          <NavSection label={ar.navComplaints}>
            {requestTypes.map((rt) => {
              const href = `/requests/${rt.id}`;
              const isActive = activeRequestTypeId === rt.id;
              const totalOrders = serviceTotals[rt.id] ?? (isActive ? sumStatusCounts(statusCounts) : 0);
              return (
                <div key={rt.id}>
                  <Link
                    href={`${href}?status=PENDING`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center justify-between gap-2 rounded-lg px-2.5 text-sm transition-colors",
                      isActive ? "bg-primary-soft font-medium text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Inbox className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                      <span className="truncate">{rt.name}</span>
                    </span>
                    <span className={cn("text-xs tabular-nums", isActive ? "text-primary/80" : "text-muted-foreground")}>
                      {totalOrders}
                    </span>
                  </Link>
                  {isActive ? (
                    <div className="ms-[1.15rem] mt-1 space-y-0.5 border-s border-border ps-2.5">
                      {STATUS_LINKS.map((s) => {
                        const statusActive = activeStatus === s.status;
                        const count = statusCounts[s.status] ?? 0;
                        return (
                          <Link
                            key={s.status}
                            href={`${href}?status=${s.status}`}
                            aria-current={statusActive ? "page" : undefined}
                            className={cn(
                              "flex h-8 items-center justify-between gap-2 rounded-md px-2 text-[13px] transition-colors",
                              statusActive
                                ? "bg-card font-medium text-foreground shadow-card ring-1 ring-border"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span aria-hidden className={cn("size-1.5 rounded-full", badgeDotClass(statusTone(s.status)))} />
                              {s.label}
                            </span>
                            <span className="tabular-nums text-xs">{count}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </NavSection>
        ) : null}

        {groups.slice(1).map((g) => (
          <NavSection key={g.label} label={g.label}>
            {g.items.map(renderItem)}
          </NavSection>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-foreground">
            {initials(user.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.displayName}</div>
            <div className="truncate text-xs text-muted-foreground" dir="ltr">
              @{user.username}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground hover:text-danger"
          loading={loggingOut}
          onClick={logout}
        >
          {loggingOut ? null : <LogOut className="size-4 rtl:-scale-x-100" />}
          {loggingOut ? ar.loading : ar.logout}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden h-full shrink-0 lg:block">{sidebar}</div>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={ar.menu}>
            <motion.button
              type="button"
              aria-label={ar.closeMenu}
              className="absolute inset-0 bg-[#1f2623]/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="absolute inset-y-0 start-0 z-50 h-full shadow-pop"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {sidebar}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/90 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? ar.closeMenu : ar.menu}
              aria-expanded={open}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
            <div className="truncate text-sm font-semibold sm:text-[15px]">{pageTitle}</div>
          </div>
          {user.role === "ADMIN" ? <NotificationBell /> : <span />}
        </header>
        {user.role === "ADMIN" ? <PushNotifications /> : null}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <motion.div
            key={`${pathname}?${searchParams.toString()}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
