"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    setUsers((await res.json()).users ?? []);
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
    toast(res.ok ? "تم إنشاء المسؤول" : "فشل الإنشاء");
    if (res.ok) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setCreateOpen(false);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{ar.users}</h1>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          {ar.addAdmin}
        </Button>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen} title={ar.addAdmin}>
        <form onSubmit={create} className="space-y-3">
          <div>
            <Label>{ar.username}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <Label>{ar.displayName}</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <Label>{ar.password}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {ar.cancel}
            </Button>
            <Button type="submit" loading={creating}>
              {creating ? ar.loading : ar.addAdmin}
            </Button>
          </div>
        </form>
      </Dialog>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={String(u.id)} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">{String(u.displayName)}</div>
              <div className="text-sm text-muted-foreground">
                @{String(u.username)} · {String(u.status)} · 2FA: {u.twoFactorEnabled ? "نعم" : "لا"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
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
                {u.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
              </Button>
              <Button
                variant="danger"
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
                حظر
              </Button>
              <Button
                variant="secondary"
                loading={busy === `${u.id}:sessions`}
                onClick={async () => {
                  setBusy(`${u.id}:sessions`);
                  await fetch(`/api/admin/users/${u.id}/sessions`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ all: true }),
                  });
                  setBusy(null);
                  toast("تم إنهاء الجلسات");
                }}
              >
                إنهاء الجلسات
              </Button>
              <Button
                variant="outline"
                loading={busy === `${u.id}:password`}
                onClick={async () => {
                  const password = window.prompt("كلمة مرور جديدة (10+ أحرف)");
                  if (!password) return;
                  setBusy(`${u.id}:password`);
                  const res = await fetch(`/api/admin/users/${u.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password }),
                  });
                  setBusy(null);
                  toast(res.ok ? "تم تغيير كلمة المرور" : "فشل تغيير كلمة المرور");
                }}
              >
                كلمة المرور
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
