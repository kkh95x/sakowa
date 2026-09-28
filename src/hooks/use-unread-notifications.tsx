"use client";

import { createContext, useContext, useEffect, useState } from "react";

type NotificationEvent = {
  id?: string;
  title?: string;
  message?: string;
  orderId?: string;
  url?: string;
};

const UnreadContext = createContext({ unread: 0, version: 0, latest: [] as NotificationEvent[] });

export function NotificationUnreadProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const [latest, setLatest] = useState<NotificationEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch("/api/notifications?page=1");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setUnread(data.unread ?? 0);
          setLatest((data.items ?? []).slice(0, 6));
          setVersion((v) => v + 1);
        }
      } catch {
        if (!cancelled) setUnread(0);
      }
    }

    function connect() {
      if (cancelled) return;
      es = new EventSource("/api/notifications/stream");
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (typeof data.unread === "number") setUnread(data.unread);
          if (Array.isArray(data.items) && data.items.length) {
            setLatest(data.items);
            setVersion((v) => v + 1);
          }
        } catch {
          /* ignore */
        }
      };
      es.addEventListener("notifications", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          if (typeof data.unread === "number") setUnread(data.unread);
          if (Array.isArray(data.items) && data.items.length) {
            setLatest(data.items);
            setVersion((v) => v + 1);
          }
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        es?.close();
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    void load();
    connect();

    return () => {
      cancelled = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  return <UnreadContext.Provider value={{ unread, version, latest }}>{children}</UnreadContext.Provider>;
}

export function useUnreadNotifications() {
  return useContext(UnreadContext).unread;
}

export function useNotificationFeed() {
  return useContext(UnreadContext);
}
