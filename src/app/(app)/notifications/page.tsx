"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn, relativeTime } from "@/lib/utils";

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
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/notifications?unread=${unreadOnly ? "1" : "0"}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, [unreadOnly]);

  async function open(n: Notif) {
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    if (n.orderId) window.location.href = `/complaints/${n.orderId}`;
    else load();
  }

  const filters = [
    { value: false, label: ar.all },
    { value: true, label: ar.unread, count: unread },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={ar.notifications}
        description={ar.notificationsDescription}
        actions={
          <Button
            variant="outline"
            size="sm"
            loading={marking}
            disabled={unread === 0}
            onClick={async () => {
              setMarking(true);
              await fetch("/api/notifications/read-all", { method: "POST" });
              setMarking(false);
              load();
            }}
          >
            <CheckCheck className="size-4" />
            {ar.markAllRead}
          </Button>
        }
      />

      <div role="tablist" aria-label={ar.notifications} className="inline-flex rounded-xl border border-border bg-card p-1">
        {filters.map((f) => {
          const active = unreadOnly === f.value;
          return (
            <button
              key={String(f.value)}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setUnreadOnly(f.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {f.count ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground tabular-nums">
                  {f.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {!loaded ? (
          <div className="divide-y divide-border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 px-5 py-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-80 max-w-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell />} title={unreadOnly ? ar.noUnreadNotifications : ar.noNotifications} />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-muted/40 sm:px-5",
                    !n.read && "bg-primary-soft/40",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className={cn("text-sm", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    </span>
                    {n.message ? (
                      <span className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                        {n.message}
                      </span>
                    ) : null}
                    {!n.read ? <span className="sr-only">{ar.unread}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
