"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff } from "lucide-react";
import { ar } from "@/i18n/ar";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications, useNotificationFeed } from "@/hooks/use-unread-notifications";

type Notif = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  orderId?: string;
  requestTypeId?: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const unread = useUnreadNotifications();
  const { version } = useNotificationFeed();
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/notifications?page=1");
    if (!res.ok) return;
    const data = await res.json();
    setItems((data.items ?? []).slice(0, 6));
  }

  useEffect(() => {
    void load();
  }, [version]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openNotif(n: Notif) {
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    setOpen(false);
    if (n.orderId) window.location.href = `/complaints/${n.orderId}`;
    else window.location.href = "/notifications";
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={unread > 0 ? `${ar.notifications} (${unread})` : ar.notifications}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-5" />
        <AnimatePresence>
          {unread > 0 ? (
            <motion.span
              key={unread}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="absolute end-0 top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-card tabular-nums"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute end-0 top-12 z-30 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">{ar.lastNotifications}</div>
              {unread > 0 ? <span className="text-xs text-muted-foreground">{unread} {ar.unread}</span> : null}
            </div>
            <div className="max-h-96 overflow-y-auto p-1.5">
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                  <BellOff className="size-5" />
                  {ar.noNotifications}
                </div>
              ) : null}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotif(n)}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-start transition-colors hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", n.read ? "text-foreground/80" : "font-semibold")}>
                      {n.title}
                    </span>
                    <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/60"
            >
              {ar.viewAllNotifications}
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
