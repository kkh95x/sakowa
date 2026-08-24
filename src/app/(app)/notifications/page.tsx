"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/utils";

type Notif = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  orderId?: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unread, setUnread] = useState(0);
  const [marking, setMarking] = useState(false);

  async function load() {
    const res = await fetch(`/api/notifications?unread=${unreadOnly ? "1" : "0"}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setUnread(data.unread ?? 0);
  }

  useEffect(() => {
    load();
  }, [unreadOnly]);

  async function open(n: Notif) {
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    if (n.orderId) window.location.href = `/orders/${n.orderId}`;
    else load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {ar.notifications} {unread > 0 ? `(${unread})` : ""}
        </h1>
        <div className="flex gap-2">
          <Button variant={unreadOnly ? "primary" : "outline"} onClick={() => setUnreadOnly(true)}>
            {ar.unread}
          </Button>
          <Button variant={!unreadOnly ? "primary" : "outline"} onClick={() => setUnreadOnly(false)}>
            {ar.all}
          </Button>
          <Button
            variant="secondary"
            loading={marking}
            onClick={async () => {
              setMarking(true);
              await fetch("/api/notifications/read-all", { method: "POST" });
              setMarking(false);
              load();
            }}
          >
            {ar.markAllRead}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => open(n)}
            className={`w-full rounded-2xl border border-border p-4 text-start ${n.read ? "bg-card" : "bg-muted"}`}
          >
            <div className="font-semibold">{n.title}</div>
            <div className="whitespace-pre-wrap text-sm text-muted-foreground">{n.message}</div>
            <div className="mt-1 text-xs">{relativeTime(n.createdAt)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
