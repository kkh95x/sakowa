"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import {
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

  useEffect(() => {
    if (!isPushSupported()) return;
    setSupported(true);
    setPermission(Notification.permission);
    setShowPrompt(
      Notification.permission === "default" && localStorage.getItem(DISMISS_KEY) !== "1",
    );
    if (Notification.permission === "granted") {
      void syncPushSubscription().then(setEnabled);
    }
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
    return (
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <span>{ar.pushResyncHint}</span>
          <Button loading={busy} onClick={() => void enable()}>
            {ar.enablePush}
          </Button>
        </div>
      </div>
    );
  }

  if (!showPrompt) return null;
  return (
    <div className="border-b border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="font-medium">{ar.pushPromptTitle}</div>
            <div className="text-muted-foreground">{ar.pushPromptBody}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={dismiss}>
            {ar.later}
          </Button>
          <Button loading={busy} onClick={() => void enable()}>
            {ar.enablePush}
          </Button>
        </div>
      </div>
    </div>
  );
}
