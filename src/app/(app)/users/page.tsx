"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LogOut, Plus, ShieldCheck, ShieldOff, UserRound } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

type PasswordTarget = { id: string; name: string; username: string };

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative" dir="ltr">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          dir="ltr"
          className="pe-10"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute end-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={visible ? ar.hidePassword : ar.showPassword}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

const USER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: ar.userActive, tone: "success" },
  DISABLED: { label: ar.userDisabled, tone: "neutral" },
  BLOCKED: { label: ar.userBlocked, tone: "danger" },
};

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<PasswordTarget | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactorTarget, setTwoFactorTarget] = useState<PasswordTarget | null>(null);
  const [clearingTwoFactor, setClearingTwoFactor] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) return;
      setUsers((await res.json()).users ?? []);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, displayName, password }),
    });
    setCreating(false);
    toast(res.ok ? ar.adminCreated : ar.adminCreateFailed, res.ok ? "success" : "error");
    if (res.ok) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setCreateOpen(false);
      load();
    }
  }

  function openPasswordDialog(target: PasswordTarget) {
    setPasswordTarget(target);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordError(null);
  }

  function closePasswordDialog() {
    if (savingPassword) return;
    setPasswordTarget(null);
    setPasswordError(null);
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordTarget) return;
    if (newPassword.length < 10) {
      setPasswordError(ar.passwordTooShort);
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError(ar.passwordComplexity);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(ar.passwordMismatch);
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    const res = await fetch(`/api/admin/users/${passwordTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    setSavingPassword(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setPasswordError(data.error || ar.passwordChangeFailed);
      return;
    }
    toast(ar.passwordChanged, "success");
    setPasswordTarget(null);
    setNewPassword("");
    setConfirmPassword("");
  }

  function closeTwoFactorDialog() {
    if (clearingTwoFactor) return;
    setTwoFactorTarget(null);
  }

  async function clearTwoFactor() {
    if (!twoFactorTarget) return;
    setClearingTwoFactor(true);
    const res = await fetch(`/api/admin/users/${twoFactorTarget.id}/2fa`, { method: "DELETE" });
    setClearingTwoFactor(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast(data.error || ar.twoFactorRemoveFailed, "error");
      return;
    }
    toast(ar.toast.twoFaRemoved, "success");
    setTwoFactorTarget(null);
    load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={ar.users}
        description={ar.usersDescription}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {ar.addAdmin}
          </Button>
        }
      />
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={ar.addAdmin}
        footer={
          <>
            <Button type="submit" form="create-admin-form" loading={creating}>
              {creating ? ar.loading : ar.addAdmin}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="create-admin-form" onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="admin-username">{ar.username}</Label>
            <Input
              id="admin-username"
              dir="ltr"
              className="text-start"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="admin-display-name">{ar.displayName}</Label>
            <Input id="admin-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="admin-password">{ar.password}</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </form>
      </Dialog>
      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(open) => {
          if (!open) closePasswordDialog();
        }}
        size="sm"
        title={ar.changePasswordTitle}
        description={
          passwordTarget ? `${passwordTarget.name} (@${passwordTarget.username})` : undefined
        }
        footerClassName="justify-start"
        footer={
          <>
            <Button type="submit" form="reset-password-form" loading={savingPassword}>
              {savingPassword ? ar.loading : ar.save}
            </Button>
            <Button type="button" variant="outline" onClick={closePasswordDialog} disabled={savingPassword}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="reset-password-form" onSubmit={resetPassword} className="space-y-4">
          <PasswordField
            id="reset-new-password"
            label={ar.newPassword}
            value={newPassword}
            onChange={(value) => {
              setNewPassword(value);
              setPasswordError(null);
            }}
            visible={showNewPassword}
            onToggleVisible={() => setShowNewPassword((visible) => !visible)}
            hint={ar.passwordPolicyHint}
          />
          <PasswordField
            id="reset-confirm-password"
            label={ar.confirmPassword}
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              setPasswordError(null);
            }}
            visible={showConfirmPassword}
            onToggleVisible={() => setShowConfirmPassword((visible) => !visible)}
          />
          <FieldError>{passwordError}</FieldError>
        </form>
      </Dialog>
      <Dialog
        open={twoFactorTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeTwoFactorDialog();
        }}
        size="sm"
        title={ar.remove2fa}
        description={
          twoFactorTarget ? `${twoFactorTarget.name} (@${twoFactorTarget.username})` : undefined
        }
        footerClassName="justify-start"
        footer={
          <>
            <Button type="button" variant="danger" onClick={clearTwoFactor} loading={clearingTwoFactor}>
              {clearingTwoFactor ? ar.loading : ar.remove2fa}
            </Button>
            <Button type="button" variant="outline" onClick={closeTwoFactorDialog} disabled={clearingTwoFactor}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{ar.remove2faHint}</p>
      </Dialog>

      <Card className="overflow-hidden">
        {!loaded ? (
          <div className="divide-y divide-border">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={<UserRound />} title={ar.noUsers} />
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => {
              const status = USER_STATUS[String(u.status)] ?? { label: String(u.status), tone: "neutral" as const };
              const name = String(u.displayName);
              return (
                <li
                  key={String(u.id)}
                  className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
                    >
                      {name.trim().charAt(0) || "?"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{name}</span>
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                        <Badge tone={u.twoFactorEnabled ? "primary" : "neutral"}>
                          <ShieldCheck className="me-1 inline size-3" aria-hidden />
                          {u.twoFactorEnabled ? ar.twoFactorOn : ar.twoFactorOff}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        <span dir="ltr">@{String(u.username)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={busy === `${u.id}:toggle`}
                      onClick={async () => {
                        setBusy(`${u.id}:toggle`);
                        await fetch(`/api/admin/users/${u.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: u.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
                        });
                        setBusy(null);
                        load();
                      }}
                    >
                      {u.status === "ACTIVE" ? ar.deactivate : ar.activate}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openPasswordDialog({
                          id: String(u.id),
                          name: String(u.displayName),
                          username: String(u.username),
                        })
                      }
                    >
                      <KeyRound className="size-3.5" />
                      {ar.changePasswordTitle}
                    </Button>
                    {u.twoFactorEnabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTwoFactorTarget({
                            id: String(u.id),
                            name: String(u.displayName),
                            username: String(u.username),
                          })
                        }
                      >
                        <ShieldOff className="size-3.5" />
                        {ar.remove2fa}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy === `${u.id}:sessions`}
                      onClick={async () => {
                        setBusy(`${u.id}:sessions`);
                        await fetch(`/api/admin/users/${u.id}/sessions`, {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ all: true }),
                        });
                        setBusy(null);
                        toast(ar.sessionsEnded);
                      }}
                    >
                      <LogOut className="size-3.5" />
                      {ar.endSessions}
                    </Button>
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      loading={busy === `${u.id}:block`}
                      onClick={async () => {
                        setBusy(`${u.id}:block`);
                        await fetch(`/api/admin/users/${u.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "BLOCKED" }),
                        });
                        setBusy(null);
                        load();
                      }}
                    >
                      {ar.block}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
