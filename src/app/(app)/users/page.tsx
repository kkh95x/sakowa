"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, Plus, ShieldCheck, UserRound } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

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
                      loading={busy === `${u.id}:password`}
                      onClick={async () => {
                        const password = window.prompt(ar.newPasswordPrompt);
                        if (!password) return;
                        setBusy(`${u.id}:password`);
                        const res = await fetch(`/api/admin/users/${u.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ password }),
                        });
                        setBusy(null);
                        toast(res.ok ? ar.passwordChanged : ar.passwordChangeFailed, res.ok ? "success" : "error");
                      }}
                    >
                      <KeyRound className="size-3.5" />
                      {ar.password}
                    </Button>
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
