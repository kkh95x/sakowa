"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Bot as BotIcon,
  ChevronLeft,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { TelegramMessageComposer } from "@/components/telegram/telegram-message-composer";
import { WELCOME_GREETING } from "@/lib/telegram/welcome-prompt";
import { cn } from "@/lib/utils";
import type { FieldType, RequestField, TelegramPromptBlock } from "@/types";
import { nextFieldName } from "@/lib/requests/field-names";
import type { BranchingRule } from "@/lib/requests/branching";
import { canMoveField, fieldsOnlyPayload, moveField, sortFieldsByOrder } from "@/lib/requests/field-order";
import { OptionsEditor } from "@/components/requests/options-editor";
import { FieldMoveButtons } from "@/components/requests/dynamic-fields-editor";

type BotRequestType = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  fields: RequestField[];
  branchingRules?: BranchingRule[];
  telegramGroupId?: string | null;
};

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
  "DYNAMIC",
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
  const [requests, setRequests] = useState<BotRequestType[]>([]);
  const [groups, setGroups] = useState<{ id: string; title: string; chatId?: number; messageThreadId?: number | null }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fields, setFields] = useState<RequestField[]>([]);
  const [welcomeBlocks, setWelcomeBlocks] = useState<TelegramPromptBlock[]>([]);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeSaved, setWelcomeSaved] = useState(false);
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  /** Reloads triggered by unrelated actions must not discard an in-progress composition. */
  const welcomeLoaded = useRef(false);

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
      if (!welcomeLoaded.current) {
        welcomeLoaded.current = true;
        setWelcomeBlocks(bj.bot.welcomePrompt?.blocks ?? []);
      }
    }
    const mine = (rj.requestTypes ?? []).filter((x: { botId: string }) => x.botId === id) as BotRequestType[];
    setRequests(mine);
    setGroups(gj.groups ?? []);
    return mine;
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

  function updateWelcome(blocks: TelegramPromptBlock[]) {
    setWelcomeBlocks(blocks);
    setWelcomeSaved(false);
    setWelcomeError(null);
  }

  async function saveWelcome() {
    const pending = welcomeBlocks.some((block) => block.type !== "text" && !block.storageId);
    if (pending) {
      setWelcomeError(ar.welcomeSaveWait);
      setWelcomeSaved(false);
      toast(ar.welcomeSaveWait, "error");
      return;
    }
    setSavingWelcome(true);
    setWelcomeError(null);
    try {
      const res = await fetch(`/api/bots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomePrompt: welcomeBlocks.length ? { blocks: welcomeBlocks } : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : ar.saveFailed;
        setWelcomeError(message);
        setWelcomeSaved(false);
        toast(message, "error");
        return;
      }
      const saved = data.bot?.welcomePrompt?.blocks;
      if (Array.isArray(saved)) setWelcomeBlocks(saved);
      setWelcomeSaved(true);
      toast(ar.welcomeMessageSaved, "success");
    } catch {
      setWelcomeError(ar.saveFailed);
      setWelcomeSaved(false);
      toast(ar.saveFailed, "error");
    } finally {
      setSavingWelcome(false);
    }
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
        name: nextFieldName(f),
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
      body: JSON.stringify(fieldsOnlyPayload(fields)),
    });
    setSavingFields(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(typeof err.error === "string" ? `${ar.saveFailed}: ${err.error}` : ar.saveFailed, "error");
      return;
    }
    toast(ar.fieldsSaved);
    const mine = await load();
    const fresh = mine?.find((r) => r.id === selected);
    if (fresh) setFields(sortFieldsByOrder(fresh.fields ?? []));
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
  const activeTypeNames = requests.filter((r) => r.active).map((r) => r.name);

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <nav aria-label="breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/bots" className="hover:text-foreground hover:underline">
            {ar.bots}
          </Link>
          <ChevronLeft className="size-3.5" aria-hidden />
          <span className="truncate text-foreground">{bot?.name ?? "…"}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-soft">
              {bot?.logoFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${bot.logoFileId}`} alt="" className="size-full object-cover" />
              ) : (
                <BotIcon className="size-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{bot?.name ?? "…"}</h1>
                {bot ? (
                  <Badge tone={bot.status === "RUNNING" ? "success" : bot.status === "ERROR" ? "danger" : "neutral"} dot>
                    {bot.status === "RUNNING" ? ar.botRunning : bot.status === "ERROR" ? ar.botError : ar.botStopped}
                  </Badge>
                ) : null}
              </div>
              {bot ? (
                <p className="text-sm text-muted-foreground">
                  <span dir="ltr">@{bot.username}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              {ar.editBot}
            </Button>
            <Button type="button" variant="ghost" size="sm" loading={syncing} onClick={syncTelegram}>
              <RefreshCw className="size-3.5" />
              {ar.syncTelegram}
            </Button>
            <Button type="button" variant="danger-ghost" size="sm" loading={deletingBot} onClick={deleteBot}>
              <Trash2 className="size-3.5" />
              {ar.deleteBot}
            </Button>
          </div>
        </div>
      </Card>
      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={ar.editBot}
        footer={
          <>
            <Button type="submit" form="edit-bot-form" loading={savingBot}>
              {savingBot ? ar.loading : ar.save}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="edit-bot-form" onSubmit={saveBot} className="space-y-4">
          <div>
            <Label>{ar.botLogo}</Label>
            <div className="flex items-center gap-3">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted">
                {bot?.logoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${bot.logoFileId}`} alt="" className="size-full object-cover" />
                ) : (
                  <BotIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              <label className={buttonClass("outline", "sm", "cursor-pointer")}>
                <Upload className="size-3.5" />
                {ar.chooseLogo}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {logoFile ? <div className="mt-1.5 text-xs text-muted-foreground">{logoFile.name}</div> : null}
          </div>
          <div>
            <Label htmlFor="edit-bot-name">{ar.name}</Label>
            <Input id="edit-bot-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="edit-bot-details">{ar.botDescription}</Label>
            <Textarea id="edit-bot-details" value={editDetails} onChange={(e) => setEditDetails(e.target.value)} rows={4} />
          </div>
        </form>
      </Dialog>
      <Dialog
        open={createRequestOpen}
        onOpenChange={setCreateRequestOpen}
        title={ar.createRequest}
        footer={
          <>
            <Button type="submit" form="create-type-form" loading={creatingRequest}>
              {creatingRequest ? ar.loading : ar.create}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateRequestOpen(false)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="create-type-form" onSubmit={createRequest} className="space-y-4">
          <div>
            <Label htmlFor="create-type-name">{ar.name}</Label>
            <Input id="create-type-name" value={requestName} onChange={(e) => setRequestName(e.target.value)} required />
          </div>
        </form>
      </Dialog>
      <Card className="p-4 sm:p-5">
        <CardHeader
          icon={<MessageSquareText className="size-4" />}
          title={ar.welcomeMessage}
          description={ar.welcomeMessageDescription}
          actions={
            <div className="flex flex-wrap gap-2">
              {welcomeBlocks.length ? (
                <Button type="button" variant="outline" size="sm" onClick={() => updateWelcome([])}>
                  {ar.welcomeMessageReset}
                </Button>
              ) : null}
              <Button type="button" size="sm" loading={savingWelcome} onClick={saveWelcome}>
                {savingWelcome ? ar.loading : welcomeSaved ? ar.welcomeSaved : ar.save}
              </Button>
            </div>
          }
        />
        {welcomeError ? <p className="mt-3 text-sm text-danger">{welcomeError}</p> : null}
        <div className="mt-4">
          <TelegramMessageComposer
            ownerId={id}
            blocks={welcomeBlocks}
            onChange={updateWelcome}
            fallbackLabel={WELCOME_GREETING}
            title={ar.welcomeMessage}
            subtitle={ar.welcomeMessageSubtitle}
            emptyHint={ar.welcomeMessageEmpty}
            buttons={[...activeTypeNames, "📋 شكاواي", "ℹ️ المساعدة"]}
            buttonsLabel={ar.welcomeThenComplaints}
          />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[280px_1fr_280px]">
        <Card className="space-y-1 self-start p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="text-sm font-semibold">{ar.requests}</div>
            <Button type="button" variant="outline" size="sm" onClick={() => setCreateRequestOpen(true)}>
              <Plus className="size-3.5" />
              {ar.create}
            </Button>
          </div>
          {requests.map((r) => (
            <button
              type="button"
              key={r.id}
              aria-pressed={selected === r.id}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-sm transition-colors",
                selected === r.id ? "bg-primary-soft font-medium text-primary" : "hover:bg-muted",
              )}
              onClick={() => {
                setSelected(r.id);
                setFields(sortFieldsByOrder(r.fields ?? []));
              }}
            >
              <span className="truncate">{r.name}</span>
              <Badge tone={r.active ? "success" : "neutral"}>{r.active ? ar.activated : ar.deactivated}</Badge>
            </button>
          ))}
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">{ar.builder}</div>
            <Button type="button" variant="outline" size="sm" onClick={addField}>
              <Plus className="size-3.5" />
              {ar.addField}
            </Button>
          </div>
          {selected && (
            <div className="mb-4">
              <Label>{ar.groups}</Label>
              <Select
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
              </Select>
            </div>
          )}
          <div className="space-y-3">
            {fields.map((f, idx) => (
              <div key={f.id} className="flex items-start gap-1.5 rounded-xl border border-border bg-muted/20 p-3">
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
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
                  <Select
                    aria-label={ar.type}
                    value={f.type}
                    onChange={(e) =>
                      setFields((all) =>
                        all.map((x, i) => (i === idx ? { ...x, type: e.target.value as FieldType } : x)),
                      )
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ar.fieldTypes[t]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={f.telegramMessage ?? ""}
                    readOnly={Boolean(f.telegramPrompt)}
                    title={f.telegramPrompt ? "هذه الرسالة مُركّبة من عدة عناصر — عدّلها من صفحة أنواع الشكاوى." : undefined}
                    onChange={(e) =>
                      setFields((all) => all.map((x, i) => (i === idx ? { ...x, telegramMessage: e.target.value } : x)))
                    }
                    placeholder="رسالة Telegram"
                  />
                  {(f.type === "SELECT" || f.type === "RADIO" || f.type === "CHECKBOX") && (
                    <div className="md:col-span-2">
                      <OptionsEditor
                        field={f}
                        rules={selectedRt?.branchingRules ?? []}
                        onChange={(options) =>
                          setFields((all) => all.map((x, i) => (i === idx ? { ...x, options } : x)))
                        }
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={f.required}
                      onChange={(e) =>
                        setFields((all) => all.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)))
                      }
                    />
                    {ar.required}
                  </label>
                </div>
                <FieldMoveButtons
                  index={idx}
                  canUp={canMoveField(fields, idx, -1)}
                  canDown={canMoveField(fields, idx, 1)}
                  onMove={(direction) => setFields((all) => moveField(all, idx, direction))}
                />
              </div>
            ))}
          </div>
          {selected && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
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
        </Card>
        <Card className="self-start p-4">
          <div className="mb-3 text-sm font-semibold">{ar.preview}</div>
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
        </Card>
      </div>
    </div>
  );
}
