"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { DynamicFieldsEditor } from "@/components/requests/dynamic-fields-editor";
import type { RequestField } from "@/types";

type Bot = { id: string; name: string; username: string };
type Group = { id: string; title: string; chatId?: number; messageThreadId?: number | null };
type RequestTab = {
  id: string;
  name: string;
  slug: string;
  botId: string;
  active: boolean;
  description?: string;
  fields?: RequestField[];
  telegramGroupId?: string | null;
};

const emptyForm = {
  name: "",
  botId: "",
  description: "",
  telegramGroupId: "",
  active: true,
  fields: [] as RequestField[],
};

export default function RequestsPage() {
  const toast = useToast();
  const router = useRouter();
  const [tabs, setTabs] = useState<RequestTab[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RequestTab | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [r, b, g] = await Promise.all([
      fetch("/api/request-types"),
      fetch("/api/bots"),
      fetch("/api/telegram/groups"),
    ]);
    const rj = await r.json();
    const bj = await b.json();
    const gj = await g.json();
    const list = (bj.bots ?? []) as Bot[];
    setBots(list);
    setGroups(gj.groups ?? []);
    setTabs(rj.requestTypes ?? []);
    if (!form.botId && list[0]) {
      setForm((f) => ({ ...f, botId: list[0].id }));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      botId: bots[0]?.id ?? "",
      active: true,
      fields: [],
    });
    setOpen(true);
  }

  function openEdit(t: RequestTab) {
    setEditing(t);
    setForm({
      name: t.name,
      botId: t.botId,
      description: t.description ?? "",
      telegramGroupId: t.telegramGroupId ?? "",
      active: t.active,
      fields: t.fields ?? [],
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.botId) return toast(ar.selectBot);
    setSaving(true);
    if (editing) {
      const meta = await fetch(`/api/request-types/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          botId: form.botId,
          telegramGroupId: form.telegramGroupId || null,
          active: form.active,
        }),
      });
      const fieldsRes = await fetch(`/api/request-types/${editing.id}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: form.fields }),
      });
      setSaving(false);
      if (!meta.ok || !fieldsRes.ok) return toast(ar.saveFailed);
      toast(ar.requestUpdated);
    } else {
      const res = await fetch("/api/request-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          botId: form.botId,
          description: form.description,
          fields: form.fields,
          active: form.active,
          telegramGroupId: form.telegramGroupId || null,
        }),
      });
      setSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(typeof err.error === "string" ? `${ar.requestCreateFailed}: ${err.error}` : ar.requestCreateFailed);
        return;
      }
      toast(ar.requestCreated);
    }
    setOpen(false);
    setEditing(null);
    router.refresh();
    load();
  }

  async function remove(id: string) {
    if (!window.confirm(ar.confirmDeleteRequest)) return;
    setBusy(`delete:${id}`);
    const res = await fetch(`/api/request-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    setBusy(null);
    if (!res.ok) {
      toast(ar.requestDeleteFailed);
      return;
    }
    toast(ar.requestDeleted);
    router.refresh();
    load();
  }

  function botName(id: string) {
    return bots.find((b) => b.id === id)?.name ?? id;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{ar.requests}</h1>
        <Button type="button" onClick={openCreate}>
          {ar.addRequestTab}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? ar.editRequest : ar.addRequestTab}
        description={ar.serviceDialogHint}
        size="xl"
        bodyClassName="flex min-h-0 flex-col overflow-hidden !p-0"
        footer={
          <>
            <label className="me-auto flex max-w-[min(100%,20rem)] items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span>
                <span className="font-medium">{ar.activate}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{ar.activateServiceHint}</span>
              </span>
            </label>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {ar.cancel}
            </Button>
            <Button type="submit" form="service-form" loading={saving}>
              {saving ? ar.loading : form.active ? ar.saveAndActivate : ar.save}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={save} className="flex h-full min-h-0 flex-col">
          <div className="max-h-[38%] shrink-0 space-y-3 overflow-y-auto border-b border-border px-5 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{ar.name}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>{ar.selectBot}</Label>
                <select
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={form.botId}
                  onChange={(e) => setForm((f) => ({ ...f, botId: e.target.value }))}
                  required
                >
                  <option value="">{ar.selectBot}</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (@{b.username})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>{ar.details}</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{ar.groups}</Label>
                <select
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={form.telegramGroupId}
                  onChange={(e) => setForm((f) => ({ ...f, telegramGroupId: e.target.value }))}
                >
                  <option value="">—</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                      {g.chatId ? ` (${g.chatId}` : ""}
                      {g.messageThreadId ? ` · #${g.messageThreadId}` : ""}
                      {g.chatId ? ")" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
            <DynamicFieldsEditor
              fields={form.fields}
              onChange={(fields) => setForm((f) => ({ ...f, fields }))}
            />
          </div>
        </form>
      </Dialog>

      {tabs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{ar.noRequestTabs}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-start">{ar.name}</th>
                <th className="px-3 py-2 text-start">{ar.linkedBot}</th>
                <th className="px-3 py-2 text-start">{ar.status}</th>
                <th className="px-3 py-2 text-start">{ar.fields}</th>
                <th className="px-3 py-2 text-start">{ar.actions}</th>
              </tr>
            </thead>
            <tbody>
              {tabs.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">{t.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{botName(t.botId)}</td>
                  <td className="px-3 py-3">{t.active ? ar.activated : ar.deactivated}</td>
                  <td className="px-3 py-3">{(t.fields ?? []).length}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="inline-flex items-center rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                        href={`/requests/${t.id}`}
                      >
                        {ar.manageOrders}
                      </a>
                      <Button type="button" variant="outline" className="px-3 py-1.5" onClick={() => openEdit(t)}>
                        {ar.editRequest}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="px-3 py-1.5"
                        loading={busy === `delete:${t.id}`}
                        onClick={() => remove(t.id)}
                      >
                        {ar.delete}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
