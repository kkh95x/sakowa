"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/utils";
import {
  isPushSupported,
  subscribeToPushNotifications,
  syncPushSubscription,
  unsubscribeFromPushNotifications,
} from "@/lib/notifications/push-client";

export default function SettingsClient() {
  const toast = useToast();
  const search = useSearchParams();
  const [user, setUser] = useState<{ twoFactorEnabled?: boolean } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");

  async function load() {
    const [me, sess] = await Promise.all([fetch("/api/auth/me"), fetch("/api/auth/sessions")]);
    setUser((await me.json()).user);
    setSessions((await sess.json()).sessions ?? []);
  }

  async function start2fa() {
    setBusy("setup2fa");
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return toast(ar.setupFailed);
    setQr(data.qrDataUrl);
    setSecret(data.secret);
  }

  useEffect(() => {
    load();
    if (search.get("setup2fa") === "1") start2fa();
    if (isPushSupported()) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
      if (Notification.permission === "granted") {
        void syncPushSubscription().then(setPushEnabled);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return toast(ar.passwordMismatch);
    setSavingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPassword(false);
    toast(res.ok ? ar.passwordChanged : ar.passwordChangeFailed);
  }

  async function enable2fa() {
    setBusy("enable2fa");
    const res = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return toast(ar.invalidTotp);
    setRecovery(data.recoveryCodes);
    setQr(null);
    toast(ar.toast.twoFaEnabled);
    load();
  }

  async function disable2fa() {
    setBusy("disable2fa");
    const res = await fetch("/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePassword, code: disableCode }),
    });
    setBusy(null);
    toast(res.ok ? ar.toast.twoFaRemoved : "فشل الإزالة");
    if (res.ok) load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{ar.settings}</h1>
      <form onSubmit={changePassword} className="max-w-lg space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">{ar.newPassword}</h2>
        <div>
          <Label>{ar.currentPassword}</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <Label>{ar.newPassword}</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <Label>{ar.confirmPassword}</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" loading={savingPassword}>
          {savingPassword ? ar.loading : ar.save}
        </Button>
      </form>

      {pushSupported && (
        <div className="max-w-lg space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">{ar.pushPromptTitle}</h2>
          <p className="text-sm text-muted-foreground">{ar.pushPromptBody}</p>
          {pushEnabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-primary">{ar.pushEnabled}</span>
              <Button
                variant="outline"
                loading={busy === "disablePush"}
                onClick={async () => {
                  setBusy("disablePush");
                  await unsubscribeFromPushNotifications();
                  setPushEnabled(false);
                  setPushPermission(Notification.permission);
                  setBusy(null);
                }}
              >
                {ar.disablePush}
              </Button>
            </div>
          ) : (
            <Button
              loading={busy === "enablePush"}
              onClick={async () => {
                setBusy("enablePush");
                const result = await subscribeToPushNotifications();
                setPushPermission(Notification.permission);
                setPushEnabled(result === "granted");
                setBusy(null);
                toast(result === "granted" ? ar.pushEnabled : ar.actionFailed);
              }}
            >
              {ar.enablePush}
            </Button>
          )}
          {pushPermission === "denied" ? (
            <p className="text-xs text-muted-foreground">{ar.pushDeniedHint}</p>
          ) : null}
        </div>
      )}

      <div className="max-w-lg space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">
          {ar.security} · {ar.twoFactor}
        </h2>
        {user?.twoFactorEnabled ? (
          <>
            <p>{ar.twoFactorEnabled}</p>
            <div>
              <Label>{ar.password}</Label>
              <Input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
            </div>
            <div>
              <Label>{ar.totpCode}</Label>
              <Input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={start2fa} loading={busy === "setup2fa"}>
                {ar.showQr}
              </Button>
              <Button variant="danger" onClick={disable2fa} loading={busy === "disable2fa"}>
                {ar.remove2fa}
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={start2fa} loading={busy === "setup2fa"}>
            {ar.enableNow}
          </Button>
        )}
        {qr && (
          <div className="space-y-2">
            <p className="text-sm">{ar.scanQr}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR" className="mx-auto h-48 w-48 rounded-xl bg-white p-2" />
            <p className="text-center text-xs">
              {ar.secretKey}: {secret}
            </p>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={ar.totpCode} />
            <Button onClick={enable2fa} loading={busy === "enable2fa"}>
              {ar.enable}
            </Button>
          </div>
        )}
        {recovery && (
          <div className="rounded-xl bg-muted p-3 text-sm">
            <div className="mb-2 font-semibold">{ar.recoveryCodes}</div>
            <div className="grid grid-cols-2 gap-1 font-mono">
              {recovery.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(recovery.join("\n"))}>
                {ar.copy}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([recovery.join("\n")], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "shakowa-recovery-codes.txt";
                  a.click();
                }}
              >
                {ar.download}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">{ar.sessions}</h2>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={String(s.id)}
              className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div>{String(s.userAgent ?? "جهاز غير معروف")}</div>
                <div className="text-xs text-muted-foreground">
                  {String(s.ip ?? "-")} · {formatTime(String(s.lastSeenAt))}
                  {s.current ? " · الحالية" : ""}
                </div>
              </div>
              {!s.current && (
                <Button
                  variant="outline"
                  loading={busy === `session:${String(s.id)}`}
                  onClick={async () => {
                    setBusy(`session:${String(s.id)}`);
                    await fetch("/api/auth/sessions", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: s.id }),
                    });
                    setBusy(null);
                    load();
                  }}
                >
                  {ar.endSession}
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          loading={busy === "endOthers"}
          onClick={async () => {
            setBusy("endOthers");
            await fetch("/api/auth/sessions", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ allOthers: true }),
            });
            setBusy(null);
            load();
          }}
        >
          {ar.endOtherSessions}
        </Button>
      </div>
    </div>
  );
}
