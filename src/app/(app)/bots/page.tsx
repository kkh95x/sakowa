"use client";

import { useEffect, useState } from "react";
import { Bot as BotIcon } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/utils";

type LastMessage = {
  text: string;
  fromName: string;
  fromUsername: string | null;
  at: string | null;
};

type Bot = {
  id: string;
  name: string;
  username: string;
  status: string;
  details?: string;
  logoFileId?: string | null;
  lastMessage?: LastMessage | null;
};

function statusLabel(status: string) {
  if (status === "RUNNING") return ar.botRunning;
  if (status === "ERROR") return ar.botError;
  return ar.botStopped;
}

export default function BotsPage() {
  const toast = useToast();
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/bots");
    const data = await res.json();
    setBots(data.bots ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, token }),
    });
    setCreating(false);
    if (!res.ok) {
      toast(ar.botCreateFailed);
      return;
    }
    setName("");
    setToken("");
    setCreateOpen(false);
    toast(ar.botCreated);
    load();
  }

  async function action(id: string, kind: "start" | "stop" | "restart" | "sync") {
    setBusy(`${id}:${kind}`);
    const res = await fetch(`/api/bots/${id}/${kind}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toast(kind === "sync" ? ar.botSyncFailed : ar.actionFailed);
      return;
    }
    if (kind === "sync") {
      toast(data?.result?.photoError ? ar.botSyncPartial : ar.botSynced);
    } else {
      toast(kind === "start" ? ar.toast.botStarted : kind === "stop" ? ar.toast.botStopped : ar.restarted);
    }
    load();
  }

  async function deleteBot(id: string) {
    if (!window.confirm(ar.confirmDeleteBot)) return;
    setBusy(`${id}:delete`);
    const res = await fetch(`/api/bots/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) toast(ar.botDeleteFailed);
    else {
      toast(ar.botDeleted);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{ar.bots}</h1>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          {ar.createBot}
        </Button>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen} title={ar.createBot}>
        <form onSubmit={createBot} className="space-y-3">
          <div>
            <Label>{ar.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>{ar.botToken}</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} required type="password" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {ar.cancel}
            </Button>
            <Button type="submit" loading={creating}>
              {creating ? ar.loading : ar.createBot}
            </Button>
          </div>
        </form>
      </Dialog>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {bots.map((b) => (
          <div
            key={b.id}
            className="flex aspect-square flex-col overflow-hidden rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {b.logoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${b.logoFileId}`} alt="" className="size-full object-cover" />
                ) : (
                  <BotIcon className="size-7 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{b.name}</div>
                <div className="truncate text-sm text-muted-foreground">@{b.username}</div>
                <div className="mt-1 text-xs font-medium text-primary">{statusLabel(b.status)}</div>
              </div>
            </div>
            {b.details ? (
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{b.details}</p>
            ) : null}
            <div className="mt-3 min-h-0 flex-1 rounded-xl bg-muted/70 p-3 text-sm">
              <div className="text-xs font-semibold text-muted-foreground">{ar.lastMessage}</div>
              {b.lastMessage?.text ? (
                <>
                  <p className="mt-1 line-clamp-3">{b.lastMessage.text}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {ar.lastSender}: {b.lastMessage.fromUsername ? `@${b.lastMessage.fromUsername}` : b.lastMessage.fromName}
                  </div>
                  {b.lastMessage.at ? (
                    <div className="mt-1 text-xs text-muted-foreground">{formatTime(b.lastMessage.at)}</div>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">{ar.noMessagesYet}</p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button loading={busy === `${b.id}:start`} onClick={() => action(b.id, "start")}>
                {ar.startBot}
              </Button>
              <Button variant="outline" loading={busy === `${b.id}:stop`} onClick={() => action(b.id, "stop")}>
                {ar.stopBot}
              </Button>
              <Button variant="secondary" loading={busy === `${b.id}:restart`} onClick={() => action(b.id, "restart")}>
                {ar.restartBot}
              </Button>
              <Button variant="outline" loading={busy === `${b.id}:sync`} onClick={() => action(b.id, "sync")}>
                {ar.syncTelegram}
              </Button>
              <a
                className="inline-flex items-center justify-center rounded-xl border border-border px-4 text-sm hover:bg-muted"
                href={`/bots/${b.id}`}
              >
                {ar.edit}
              </a>
              <Button
                variant="danger"
                loading={busy === `${b.id}:delete`}
                onClick={() => deleteBot(b.id)}
              >
                {ar.deleteBot}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
