"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot as BotIcon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/utils";

const BOT_TONE: Record<string, BadgeTone> = { RUNNING: "success", ERROR: "danger", STOPPED: "neutral" };

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
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/bots");
      const data = await res.json();
      setBots(data.bots ?? []);
    } finally {
      setLoaded(true);
    }
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data.error === "string" ? data.error : ar.botCreateFailed;
      toast(msg.startsWith("TELEGRAM_UNREACHABLE") ? ar.telegramUnreachable : msg, "error");
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
    <div className="space-y-5">
      <PageHeader
        title={ar.bots}
        description={ar.botsDescription}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {ar.createBot}
          </Button>
        }
      />
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={ar.createBot}
        footer={
          <>
            <Button type="submit" form="create-bot-form" loading={creating}>
              {creating ? ar.loading : ar.createBot}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="create-bot-form" onSubmit={createBot} className="space-y-4">
          <div>
            <Label htmlFor="bot-name">{ar.name}</Label>
            <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="bot-token">{ar.botToken}</Label>
            <Input
              id="bot-token"
              dir="ltr"
              className="text-start"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              type="password"
            />
          </div>
        </form>
      </Dialog>

      {!loaded ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BotIcon />}
            title={ar.noBots}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                {ar.createBot}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bots.map((b) => (
            <Card key={b.id} className="flex flex-col p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-soft">
                  {b.logoFileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${b.logoFileId}`} alt="" className="size-full object-cover" />
                  ) : (
                    <BotIcon className="size-6 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/bots/${b.id}`} className="block truncate font-semibold hover:text-primary hover:underline">
                    {b.name}
                  </Link>
                  <div className="truncate text-sm text-muted-foreground">
                    <span dir="ltr">@{b.username}</span>
                  </div>
                </div>
                <Badge tone={BOT_TONE[b.status] ?? "neutral"} dot>
                  {statusLabel(b.status)}
                </Badge>
              </div>
              {b.details ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{b.details}</p> : null}
              <div className="mt-3 flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">{ar.lastMessage}</span>
                  {b.lastMessage?.at ? <span>{formatTime(b.lastMessage.at)}</span> : null}
                </div>
                {b.lastMessage?.text ? (
                  <>
                    <p className="mt-1 line-clamp-2">{b.lastMessage.text}</p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {ar.lastSender}:{" "}
                      {b.lastMessage.fromUsername ? (
                        <span dir="ltr">@{b.lastMessage.fromUsername}</span>
                      ) : (
                        b.lastMessage.fromName
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-muted-foreground">{ar.noMessagesYet}</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {b.status === "RUNNING" ? (
                  <Button size="sm" variant="outline" loading={busy === `${b.id}:stop`} onClick={() => action(b.id, "stop")}>
                    <Square className="size-3.5" />
                    {ar.stopBot}
                  </Button>
                ) : (
                  <Button size="sm" loading={busy === `${b.id}:start`} onClick={() => action(b.id, "start")}>
                    <Play className="size-3.5" />
                    {ar.startBot}
                  </Button>
                )}
                <Button size="sm" variant="ghost" loading={busy === `${b.id}:restart`} onClick={() => action(b.id, "restart")}>
                  <RotateCw className="size-3.5" />
                  {ar.restartBot}
                </Button>
                <div className="ms-auto flex items-center gap-1">
                  <Dropdown
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label={ar.moreActions} title={ar.moreActions}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    }
                  >
                    <DropdownItem icon={<Pencil />} onSelect={() => router.push(`/bots/${b.id}`)}>
                      {ar.edit}
                    </DropdownItem>
                    <DropdownItem icon={<RefreshCw />} onSelect={() => action(b.id, "sync")}>
                      {ar.syncTelegram}
                    </DropdownItem>
                    {b.status === "RUNNING" ? (
                      <DropdownItem icon={<Play />} onSelect={() => action(b.id, "start")}>
                        {ar.startBot}
                      </DropdownItem>
                    ) : (
                      <DropdownItem icon={<Square />} onSelect={() => action(b.id, "stop")}>
                        {ar.stopBot}
                      </DropdownItem>
                    )}
                    <DropdownSeparator />
                    <DropdownItem icon={<Trash2 />} danger onSelect={() => deleteBot(b.id)}>
                      {ar.deleteBot}
                    </DropdownItem>
                  </Dropdown>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
