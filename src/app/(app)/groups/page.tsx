"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  async function load() {
    const [g, r] = await Promise.all([fetch("/api/telegram/groups"), fetch("/api/request-types")]);
    setGroups((await g.json()).groups ?? []);
    setTypes((await r.json()).requestTypes ?? []);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{ar.groups}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ar.addBotToGroup}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          {ar.addGroup}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen} title={editing ? ar.editGroup : ar.addGroup}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <Label>{ar.groupName}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>{ar.groupChatId}</Label>
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-100xxxxxxxxxx"
              required
            />
          </div>
          <div>
            <Label>{ar.messageThreadId}</Label>
            <Input
              value={messageThreadId}
              onChange={(e) => setMessageThreadId(e.target.value)}
              placeholder="مثال: 12"
            />
            <p className="mt-1 text-xs text-muted-foreground">{ar.messageThreadIdHint}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {ar.cancel}
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? ar.loading : ar.save}
            </Button>
          </div>
        </form>
      </Dialog>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{ar.noGroups}</div>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{groupLabel(g)}</div>
                  {g.messageThreadId ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {ar.messageThreadId}: {g.messageThreadId}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => openEdit(g)}>
                    {ar.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    loading={busy === `delete:${g.id}`}
                    onClick={() => remove(g.id)}
                  >
                    {ar.deleteGroup}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {types.map((t) => {
                  const linked = t.telegramGroupId === g.id;
                  return (
                    <Button
                      key={t.id}
                      variant={linked ? "primary" : "outline"}
                      loading={busy === `${g.id}:${t.id}`}
                      onClick={async () => {
                        setBusy(`${g.id}:${t.id}`);
                        const res = await fetch(`/api/request-types/${t.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ telegramGroupId: linked ? null : g.id }),
                        });
                        setBusy(null);
                        toast(res.ok ? `${linked ? ar.deactivate : ar.linked} ${t.name}` : ar.linkFailed);
                        if (res.ok) load();
                      }}
                    >
                      {linked ? "✓ " : ""}
                      {ar.linkTo} {t.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
