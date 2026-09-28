"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, KeyRound, Laptop, ShieldCheck } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
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
    toast(res.ok ? ar.passwordChanged : ar.passwordChangeFailed, res.ok ? "success" : "error");
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
    toast(res.ok ? ar.toast.twoFaRemoved : ar.twoFactorRemoveFailed, res.ok ? "success" : "error");
    if (res.ok) load();
  }

  return (
    <div className="space-y-5">
      <PageHeader title={ar.settings} description={ar.settingsDescription} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<KeyRound />} title={ar.changePasswordTitle} />
          <form onSubmit={changePassword} className="space-y-4 p-4 sm:p-5">
            <div>
              <Label htmlFor="current-password">{ar.currentPassword}</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-password">{ar.newPassword}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">{ar.confirmPassword}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" loading={savingPassword}>
              {savingPassword ? ar.loading : ar.save}
            </Button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              icon={<ShieldCheck />}
              title={ar.twoFactor}
              actions={
                user ? (
                  <Badge tone={user.twoFactorEnabled ? "success" : "neutral"} dot>
                    {user.twoFactorEnabled ? ar.activated : ar.deactivated}
                  </Badge>
                ) : null
              }
            />
            <div className="space-y-4 p-4 sm:p-5">
              {user?.twoFactorEnabled ? (
                <>
                  <p className="text-sm text-muted-foreground">{ar.twoFactorEnabled}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="disable-2fa-password">{ar.password}</Label>
                      <Input
                        id="disable-2fa-password"
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="disable-2fa-code">{ar.totpCode}</Label>
                      <Input
                        id="disable-2fa-code"
                        inputMode="numeric"
                        dir="ltr"
                        className="text-start"
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={start2fa} loading={busy === "setup2fa"}>
                      {ar.showQr}
                    </Button>
                    <Button variant="danger-ghost" size="sm" onClick={disable2fa} loading={busy === "disable2fa"}>
                      {ar.remove2fa}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{ar.twoFactorDisabledHint}</p>
                  <Button size="sm" onClick={start2fa} loading={busy === "setup2fa"}>
                    {ar.enableNow}
                  </Button>
                </div>
              )}
              {qr && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm">{ar.scanQr}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR" className="mx-auto size-48 rounded-xl border border-border bg-white p-2" />
                  <p className="text-center text-xs text-muted-foreground">
                    {ar.secretKey}:{" "}
                    <code dir="ltr" className="break-all font-mono text-foreground">
                      {secret}
                    </code>
                  </p>
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      className="text-start"
                      aria-label={ar.totpCode}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={ar.totpCode}
                    />
                    <Button onClick={enable2fa} loading={busy === "enable2fa"} className="shrink-0">
                      {ar.enable}
                    </Button>
                  </div>
                </div>
              )}
              {recovery && (
                <div className="rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm">
                  <div className="mb-2 font-semibold text-accent-foreground">{ar.recoveryCodes}</div>
                  <div className="grid grid-cols-2 gap-1 font-mono" dir="ltr">
                    {recovery.map((c) => (
                      <div key={c}>{c}</div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(recovery.join("\n"))}>
                      {ar.copy}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
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
          </Card>

          {pushSupported && (
            <Card>
              <CardHeader
                icon={<Bell />}
                title={ar.pushPromptTitle}
                actions={
                  pushEnabled ? (
                    <Badge tone="success" dot>
                      {ar.pushEnabled}
                    </Badge>
                  ) : null
                }
              />
              <div className="space-y-3 p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{ar.pushPromptBody}</p>
                {pushEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
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
                ) : (
                  <Button
                    size="sm"
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
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          icon={<Laptop />}
          title={ar.sessions}
          actions={
            <Button
              variant="outline"
              size="sm"
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
          }
        />
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li
              key={String(s.id)}
              className="flex flex-col gap-2 px-4 py-3 text-sm sm:px-5 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all" dir="ltr">
                    {String(s.userAgent ?? ar.unknownDevice)}
                  </span>
                  {s.current ? <Badge tone="primary">{ar.currentSession}</Badge> : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  <span dir="ltr">{String(s.ip ?? "—")}</span> · {formatTime(String(s.lastSeenAt))}
                </div>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start md:self-auto"
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
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
