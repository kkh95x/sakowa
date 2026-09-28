"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldHint, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

type Group = {
  id: string;
  title: string;
  chatId: number;
  messageThreadId: number | null;
  type?: string;
};
type RequestType = { id: string; name: string; telegramGroupId?: string | null };

function groupLabel(g: Group) {
  const thread = g.messageThreadId ? ` · thread ${g.messageThreadId}` : "";
  return `${g.title} (${g.chatId}${thread})`;
}

export default function GroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [types, setTypes] = useState<RequestType[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [title, setTitle] = useState("");
  const [chatId, setChatId] = useState("");
  const [messageThreadId, setMessageThreadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const [g, r] = await Promise.all([fetch("/api/telegram/groups"), fetch("/api/request-types")]);
      setGroups((await g.json()).groups ?? []);
      setTypes((await r.json()).requestTypes ?? []);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setChatId("");
    setMessageThreadId("");
    setOpen(true);
  }

  function openEdit(g: Group) {
    setEditing(g);
    setTitle(g.title);
    setChatId(String(g.chatId));
    setMessageThreadId(g.messageThreadId ? String(g.messageThreadId) : "");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      title,
      chatId,
      messageThreadId: messageThreadId.trim() ? messageThreadId.trim() : null,
      type: "supergroup" as const,
    };
    const res = editing
      ? await fetch(`/api/telegram/groups/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/telegram/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    setSaving(false);
    if (!res.ok) {
      toast(editing ? ar.updateFailed : ar.groupCreateFailed);
      return;
    }
    toast(editing ? ar.groupUpdated : ar.groupCreated);
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!window.confirm(ar.confirmDeleteGroup)) return;
    setBusy(`delete:${id}`);
    const res = await fetch(`/api/telegram/groups/${id}`, { method: "DELETE" });
    setBusy(null);
    toast(res.ok ? ar.groupDeleted : ar.actionFailed);
    if (res.ok) load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={ar.groups}
        description={ar.addBotToGroup}
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            {ar.addGroup}
          </Button>
        }
      />

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? ar.editGroup : ar.addGroup}
        footer={
          <>
            <Button type="submit" form="group-form" loading={saving}>
              {saving ? ar.loading : ar.save}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="group-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="group-title">{ar.groupName}</Label>
            <Input id="group-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="group-chat-id">{ar.groupChatId}</Label>
            <Input
              id="group-chat-id"
              dir="ltr"
              className="text-start"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-100xxxxxxxxxx"
              required
            />
          </div>
          <div>
            <Label htmlFor="group-thread">{ar.messageThreadId}</Label>
            <Input
              id="group-thread"
              dir="ltr"
              className="text-start"
              value={messageThreadId}
              onChange={(e) => setMessageThreadId(e.target.value)}
              placeholder="مثال: 12"
            />
            <FieldHint>{ar.messageThreadIdHint}</FieldHint>
          </div>
        </form>
      </Dialog>

      {!loaded ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={ar.noGroups}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
                <Plus className="size-3.5" />
                {ar.addGroup}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <Card key={g.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Users className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">{g.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span dir="ltr" className="tabular-nums">
                        {g.chatId}
                      </span>
                      {g.messageThreadId ? (
                        <Badge tone="neutral">
                          {ar.thread} <span dir="ltr">#{g.messageThreadId}</span>
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(g)}>
                    <Pencil className="size-3.5" />
                    {ar.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="danger-ghost"
                    size="sm"
                    loading={busy === `delete:${g.id}`}
                    onClick={() => remove(g.id)}
                  >
                    <Trash2 className="size-3.5" />
                    {ar.deleteGroup}
                  </Button>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">{ar.linkedTypes}</div>
                {types.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar.noTypesToLink}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {types.map((t) => {
                      const linked = t.telegramGroupId === g.id;
                      return (
                        <Button
                          key={t.id}
                          size="sm"
                          variant={linked ? "secondary" : "outline"}
                          aria-pressed={linked}
                          title={groupLabel(g)}
                          loading={busy === `${g.id}:${t.id}`}
                          onClick={async () => {
                            setBusy(`${g.id}:${t.id}`);
                            const res = await fetch(`/api/request-types/${t.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ telegramGroupId: linked ? null : g.id }),
                            });
                            setBusy(null);
                            toast(
                              res.ok ? `${linked ? ar.deactivate : ar.linked} ${t.name}` : ar.linkFailed,
                              res.ok ? "success" : "error",
                            );
                            if (res.ok) load();
                          }}
                        >
                          {linked ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                          {linked ? t.name : `${ar.linkTo} ${t.name}`}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
