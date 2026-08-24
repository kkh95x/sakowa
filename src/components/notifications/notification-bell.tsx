"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { ar } from "@/i18n/ar";
import { relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

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

  async function load() {
    const res = await fetch("/api/notifications?page=1");
    if (!res.ok) return;
    const data = await res.json();
    setItems((data.items ?? []).slice(0, 6));
  }

  useEffect(() => {
    void load();
  }, []);

  async function openNotif(n: Notif) {
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    setOpen(false);
    if (n.orderId) window.location.href = `/orders/${n.orderId}`;
    else window.location.href = "/notifications";
  }

  return (
    <div className="relative">
      <Button variant="ghost" aria-label={ar.notifications} onClick={() => setOpen((v) => !v)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -start-1 rounded-full bg-danger px-1.5 text-[10px] text-white">
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute end-0 top-11 z-30 w-80 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 text-sm font-semibold">{ar.lastNotifications}</div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {items.length === 0 && <div className="text-sm text-muted-foreground">{ar.noNotifications}</div>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotif(n)}
                className="w-full rounded-xl bg-muted/50 p-2 text-start text-sm hover:bg-muted"
              >
                <div className="font-medium">{n.title}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{n.message}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</div>
              </button>
            ))}
          </div>
          <Link href="/notifications" className="mt-3 block text-center text-sm text-primary">
            {ar.viewAllNotifications}
          </Link>
        </div>
      )}
    </div>
  );
}
