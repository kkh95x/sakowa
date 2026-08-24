"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { FieldType, RequestField } from "@/types";

const FIELD_TYPES: FieldType[] = [
  "TEXT",
  "EMAIL",
  "PASSWORD",
  "NUMBER",
  "PHONE",
  "URL",
  "DATE",
  "DATETIME",
  "SELECT",
  "RADIO",
  "CHECKBOX",
  "TEXTAREA",
  "FILE",
  "IMAGE",
  "INSTRUCTION",
  "CONFIRMATION",
];

export default function BotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [bot, setBot] = useState<{
    id: string;
    name: string;
    username: string;
    status: string;
    details?: string;
    logoFileId?: string | null;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingBot, setSavingBot] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [createRequestOpen, setCreateRequestOpen] = useState(false);
  const [deletingBot, setDeletingBot] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [requestName, setRequestName] = useState("");
  const [requests, setRequests] = useState<
    { id: string; name: string; slug: string; active: boolean; fields: RequestField[]; telegramGroupId?: string | null }[]
  >([]);
  const [groups, setGroups] = useState<{ id: string; title: string; chatId?: number; messageThreadId?: number | null }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fields, setFields] = useState<RequestField[]>([]);

  async function load() {
    const [b, r, g] = await Promise.all([
      fetch(`/api/bots/${id}`),
      fetch("/api/request-types"),
      fetch("/api/telegram/groups"),
    ]);
    const bj = await b.json();
    const rj = await r.json();
    const gj = await g.json();
    setBot(bj.bot);
    if (bj.bot) {
      setEditName(bj.bot.name ?? "");
      setEditDetails(bj.bot.details ?? "");
    }
    const mine = (rj.requestTypes ?? []).filter((x: { botId: string }) => x.botId === id);
    setRequests(mine);
    setGroups(gj.groups ?? []);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function saveBot(e: React.FormEvent) {
    e.preventDefault();
    setSavingBot(true);
    const res = await fetch(`/api/bots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, details: editDetails }),
    });
    if (res.ok && logoFile) {
      const fd = new FormData();
      fd.append("file", logoFile);
      const logoRes = await fetch(`/api/bots/${id}/logo`, { method: "POST", body: fd });
      if (!logoRes.ok) {
        setSavingBot(false);
        toast(ar.botUpdateFailed);
        return;
      }
      setLogoFile(null);
    }
    setSavingBot(false);
    if (!res.ok) return toast(ar.botUpdateFailed);
    toast(ar.botUpdated);
    setEditOpen(false);
    load();
  }

  async function deleteBot() {
    if (!window.confirm(ar.confirmDeleteBot)) return;
    setDeletingBot(true);
    const res = await fetch(`/api/bots/${id}`, { method: "DELETE" });
    setDeletingBot(false);
    if (!res.ok) return toast(ar.botDeleteFailed);
    toast(ar.botDeleted);
    window.location.href = "/bots";
  }

  async function syncTelegram() {
    setSyncing(true);
    const res = await fetch(`/api/bots/${id}/sync`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) return toast(ar.botSyncFailed);
    if (data?.result?.photoError) toast(ar.botSyncPartial);
    else toast(ar.botSynced);
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setCreatingRequest(true);
    const res = await fetch("/api/request-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: requestName, botId: id }),
    });
    setCreatingRequest(false);
    if (!res.ok) return toast(ar.requestCreateFailed);
    setRequestName("");
    setCreateRequestOpen(false);
    toast(ar.requestCreated);
    load();
  }

  function addField() {
    setFields((f) => [
      ...f,
      {
        id: crypto.randomUUID(),
        name: `field_${f.length + 1}`,
        label: `حقل ${f.length + 1}`,
        type: "TEXT",
        required: true,
        sensitive: false,
        order: f.length,
        active: true,
        telegramMessage: "",
        options: [],
      },
    ]);
  }

  async function saveFields() {
    if (!selected) return;
    setSavingFields(true);
    const res = await fetch(`/api/request-types/${selected}/fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    setSavingFields(false);
    toast(res.ok ? ar.fieldsSaved : ar.saveFailed);
    load();
  }

  async function activate(requestId: string, active: boolean) {
    setActivating(active ? "on" : "off");
    await fetch(`/api/request-types/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setActivating(null);
    toast(active ? ar.activated : ar.deactivated);
    load();
  }

  const selectedRt = requests.find((r) => r.id === selected);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{bot?.name ?? "..."}</h1>
          <p className="text-sm text-muted-foreground">
            @{bot?.username} · {bot?.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
            {ar.editBot}
          </Button>
          <Button type="button" variant="secondary" loading={syncing} onClick={syncTelegram}>
            {ar.syncTelegram}
          </Button>
          <Button type="button" variant="danger" loading={deletingBot} onClick={deleteBot}>
            {ar.deleteBot}
          </Button>
        </div>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen} title={ar.editBot}>
        <form onSubmit={saveBot} className="space-y-3">
          <div>
            <Label>{ar.botLogo}</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {bot?.logoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${bot.logoFileId}`} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              <label className="cursor-pointer text-sm text-primary">
                {ar.chooseLogo}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {logoFile ? <div className="mt-1 text-xs text-muted-foreground">{logoFile.name}</div> : null}
          </div>
          <div>
            <Label>{ar.name}</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <div>
            <Label>{ar.botDescription}</Label>
            <textarea
              value={editDetails}
              onChange={(e) => setEditDetails(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {ar.cancel}
            </Button>
            <Button type="submit" loading={savingBot}>
              {savingBot ? ar.loading : ar.save}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={createRequestOpen} onOpenChange={setCreateRequestOpen} title={ar.createRequest}>
        <form onSubmit={createRequest} className="space-y-3">
          <div>
            <Label>{ar.name}</Label>
            <Input value={requestName} onChange={(e) => setRequestName(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateRequestOpen(false)}>
              {ar.cancel}
            </Button>
            <Button type="submit" loading={creatingRequest}>
              {creatingRequest ? ar.loading : ar.create}
            </Button>
          </div>
        </form>
      </Dialog>
      <div className="grid gap-4 xl:grid-cols-[280px_1fr_280px]">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">{ar.requests}</div>
            <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={() => setCreateRequestOpen(true)}>
              {ar.create}
            </Button>
          </div>
          {requests.map((r) => (
            <button
              key={r.id}
              className={`block w-full rounded-xl px-3 py-2 text-start text-sm ${selected === r.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => {
                setSelected(r.id);
                setFields(r.fields ?? []);
              }}
            >
              {r.name}
              <div className="text-xs opacity-80">{r.active ? ar.activated : ar.deactivated}</div>
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">{ar.builder}</div>
            <Button type="button" variant="outline" onClick={addField}>
              {ar.addField}
            </Button>
          </div>
          {selected && (
            <div className="mb-4">
              <Label>{ar.groups}</Label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={selectedRt?.telegramGroupId ?? ""}
                onChange={async (e) => {
                  const res = await fetch(`/api/request-types/${selected}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ telegramGroupId: e.target.value || null }),
                  });
                  toast(res.ok ? ar.linked : ar.linkFailed);
                  load();
                }}
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
          )}
          <div className="space-y-3">
            {fields.map((f, idx) => (
              <div key={f.id} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-2">
                <Input
                  value={f.label}
                  onChange={(e) =>
                    setFields((all) => all.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder={ar.displayName}
                />
                <Input
                  value={f.name}
                  onChange={(e) =>
                    setFields((all) => all.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder={ar.name}
                />
                <select
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={f.type}
                  onChange={(e) =>
                    setFields((all) =>
                      all.map((x, i) =>
                        i === idx
                          ? {
                              ...x,
                              type: e.target.value as FieldType,
                            }
                          : x,
                      ),
                    )
                  }
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ar.fieldTypes[t]}
                    </option>
                  ))}
                </select>
                <Input
                  value={f.telegramMessage ?? ""}
                  onChange={(e) =>
                    setFields((all) => all.map((x, i) => (i === idx ? { ...x, telegramMessage: e.target.value } : x)))
                  }
                  placeholder="رسالة Telegram"
                />
                {(f.type === "SELECT" || f.type === "RADIO" || f.type === "CHECKBOX") && (
                  <Input
                    className="md:col-span-2"
                    value={(f.options ?? []).map((o) => o.label).join(", ")}
                    onChange={(e) =>
                      setFields((all) =>
                        all.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                options: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                                  .map((label) => ({ label, value: label })),
                              }
                            : x,
                        ),
                      )
                    }
                    placeholder={ar.optionsHint}
                  />
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setFields((all) => all.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)))
                    }
                  />
                  {ar.required}
                </label>
              </div>
            ))}
          </div>
          {selected && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={saveFields} loading={savingFields}>
                {savingFields ? ar.loading : ar.save}
              </Button>
              <Button variant="secondary" onClick={() => activate(selected, true)} loading={activating === "on"}>
                {ar.activate}
              </Button>
              <Button variant="outline" onClick={() => activate(selected, false)} loading={activating === "off"}>
                {ar.deactivate}
              </Button>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 font-semibold">{ar.preview}</div>
          <div className="mx-auto max-w-[240px] rounded-[1.75rem] border-4 border-secondary bg-[#0e1621] p-3 text-sm text-white shadow-lg">
            <div className="mb-3 text-center text-xs text-white/60">Telegram</div>
            <div className="space-y-2">
              {fields.map((f) => (
                <div key={f.id} className="rounded-2xl rounded-se-md bg-[#182533] px-3 py-2">
                  {f.telegramMessage || f.label}
                  {(f.type === "SELECT" || f.type === "RADIO" || f.type === "CHECKBOX") && (
                    <div className="mt-2 space-y-1">
                      {(f.options ?? []).map((o) => (
                        <div key={o.value} className="rounded-lg bg-[#2b5278] px-2 py-1 text-center text-xs">
                          {o.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {fields.length === 0 && <div className="text-center text-xs text-white/50">—</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
