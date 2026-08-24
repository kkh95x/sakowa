"use client";

import { createContext, useContext, useEffect, useState } from "react";

const UnreadContext = createContext(0);

export function NotificationUnreadProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/notifications?page=1");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setUnread(data.unread ?? 0);
      } catch {
        if (!cancelled) setUnread(0);
      }
    }

    void load();
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (typeof data.unread === "number") setUnread(data.unread);
      } catch {
        /* ignore */
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, []);

  return <UnreadContext.Provider value={unread}>{children}</UnreadContext.Provider>;
}

export function useUnreadNotifications() {
  return useContext(UnreadContext);
}
