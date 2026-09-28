"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import {
  isPushServerConfigured,
  isPushSupported,
  subscribeToPushNotifications,
  syncPushSubscription,
} from "@/lib/notifications/push-client";

const DISMISS_KEY = "bothub_push_prompt_dismissed";

export function PushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    let cancelled = false;
    void (async () => {
      if (!(await isPushServerConfigured()) || cancelled) return;
      setSupported(true);
      setPermission(Notification.permission);
      setShowPrompt(
        Notification.permission === "default" && localStorage.getItem(DISMISS_KEY) !== "1",
      );
      if (Notification.permission === "granted") {
        const ok = await syncPushSubscription().catch(() => false);
        if (cancelled) return;
        setEnabled(ok);
      }
      setSynced(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    const result = await subscribeToPushNotifications();
    setBusy(false);
    setPermission(Notification.permission);
    if (result === "granted") {
      setEnabled(true);
      setShowPrompt(false);
      return;
    }
    if (result === "denied") setShowPrompt(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShowPrompt(false);
  }

  if (!supported || permission === "denied") return null;
  if (enabled && !showPrompt) return null;

  if (permission === "granted" && !enabled) {
    if (!synced) return null;
    return (
      <div className="border-b border-border bg-muted/50 px-4 py-2 text-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">{ar.pushResyncHint}</span>
          <Button size="sm" loading={busy} onClick={() => void enable()}>
            {ar.enablePush}
          </Button>
        </div>
      </div>
    );
  }

  if (!showPrompt) return null;
  return (
    <div className="border-b border-primary/15 bg-primary-soft/60 px-4 py-2.5 text-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="font-medium">{ar.pushPromptTitle}</div>
            <div className="text-xs text-muted-foreground sm:text-sm">{ar.pushPromptBody}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss}>
            {ar.later}
          </Button>
          <Button size="sm" loading={busy} onClick={() => void enable()}>
            {ar.enablePush}
          </Button>
        </div>
      </div>
    </div>
  );
}
