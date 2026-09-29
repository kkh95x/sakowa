"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot as BotIcon, FolderKanban, ListChecks, Pencil, Plus, Trash2, Users } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldHint, Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { DynamicFieldsEditor } from "@/components/requests/dynamic-fields-editor";
import { BranchingRulesEditor } from "@/components/requests/branching-rules-editor";
import type { RequestField } from "@/types";
import type { BranchingRule } from "@/lib/requests/branching";
import { validatePromptBlocks } from "@/lib/telegram/field-prompt";
import { sortFieldsByOrder } from "@/lib/requests/field-order";
import { COMPLAINT_TEMPLATES, fieldsFromTemplate } from "@/lib/requests/complaint-templates";

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
  branchingRules?: BranchingRule[];
  telegramGroupId?: string | null;
};

const emptyForm = {
  name: "",
  botId: "",
  description: "",
  telegramGroupId: "",
  active: true,
  fields: [] as RequestField[],
  branchingRules: [] as BranchingRule[],
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
  const [loaded, setLoaded] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  async function load() {
    try {
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
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openFromTemplate(id: string) {
    const template = COMPLAINT_TEMPLATES.find((item) => item.id === id);
    if (!template) return;
    setEditing(null);
    setForm({
      ...emptyForm,
      botId: bots[0]?.id ?? "",
      active: true,
      name: template.name,
      description: template.description,
      fields: fieldsFromTemplate(template),
      branchingRules: [],
    });
    setTemplateOpen(false);
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      botId: bots[0]?.id ?? "",
      active: true,
      fields: [],
      branchingRules: [],
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
      fields: sortFieldsByOrder(t.fields ?? []),
      branchingRules: t.branchingRules ?? [],
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.botId) return toast(ar.selectBot, "error");
    for (const field of form.fields) {
      if (!field.telegramPrompt) continue;
      const [problem] = validatePromptBlocks(field.telegramPrompt.blocks);
      if (problem) return toast(`${field.label || field.name}: ${problem.message}`, "error");
    }
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
        body: JSON.stringify({ fields: form.fields, branchingRules: form.branchingRules }),
      });
      setSaving(false);
      if (!fieldsRes.ok) {
        const err = await fieldsRes.json().catch(() => ({}));
        return toast(typeof err.error === "string" ? `${ar.saveFailed}: ${err.error}` : ar.saveFailed, "error");
      }
      if (!meta.ok) return toast(ar.saveFailed, "error");
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
          branchingRules: form.branchingRules,
          active: form.active,
          telegramGroupId: form.telegramGroupId || null,
        }),
      });
      setSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(typeof err.error === "string" ? `${ar.requestCreateFailed}: ${err.error}` : ar.requestCreateFailed, "error");
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
      toast(ar.requestDeleteFailed, "error");
      return;
    }
    toast(ar.requestDeleted);
    router.refresh();
    load();
  }

  function botName(id: string) {
    return bots.find((b) => b.id === id)?.name ?? id;
  }

  function groupTitle(id?: string | null) {
    if (!id) return null;
    return groups.find((g) => g.id === id)?.title ?? null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.requests}
        description={ar.requestsDescription}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setTemplateOpen(true)}>
              <FolderKanban className="size-4" />
              {ar.addFromTemplate}
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              {ar.addRequestTab}
            </Button>
          </>
        }
      />

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? ar.editRequest : ar.addRequestTab}
        description={ar.serviceDialogHint}
        size="xl"
        bodyClassName="!p-0"
        footer={
          <>
            <label className="me-auto flex w-full cursor-pointer items-start gap-2.5 text-sm sm:w-auto sm:max-w-[22rem]">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span>
                <span className="font-medium">{ar.activate}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{ar.activateServiceHint}</span>
              </span>
            </label>
            <Button type="submit" form="service-form" loading={saving}>
              {saving ? ar.loading : form.active ? ar.saveAndActivate : ar.save}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={save} className="flex flex-col">
          <section className="border-b border-border px-5 py-5 sm:px-6" aria-labelledby="type-basic-info">
            <h3 id="type-basic-info" className="mb-4 text-sm font-semibold">
              {ar.basicInfo}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="type-name">{ar.name}</Label>
                <Input
                  id="type-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="type-bot">{ar.linkedBot}</Label>
                <Select
                  id="type-bot"
                  value={form.botId}
                  onChange={(e) => setForm((f) => ({ ...f, botId: e.target.value }))}
                  required
                >
                  <option value="">{ar.selectBot}</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {`${b.name} (\u2066@${b.username}\u2069)`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="type-description">{ar.details}</Label>
                <Textarea
                  id="type-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="type-group">{ar.groups}</Label>
                <Select
                  id="type-group"
                  value={form.telegramGroupId}
                  onChange={(e) => setForm((f) => ({ ...f, telegramGroupId: e.target.value }))}
                >
                  <option value="">{ar.noGroup}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                      {g.chatId ? ` (${g.chatId}` : ""}
                      {g.messageThreadId ? ` · #${g.messageThreadId}` : ""}
                      {g.chatId ? ")" : ""}
                    </option>
                  ))}
                </Select>
                <FieldHint>{ar.telegramGroupHint}</FieldHint>
              </div>
            </div>
          </section>

          <div className="space-y-4 bg-background/60 p-3 sm:p-5">
            <DynamicFieldsEditor
              fields={form.fields}
              branchingRules={form.branchingRules}
              onChange={(fields) => setForm((f) => ({ ...f, fields }))}
            />
            <BranchingRulesEditor
              fields={form.fields}
              rules={form.branchingRules}
              onChange={(branchingRules) => setForm((f) => ({ ...f, branchingRules }))}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        title={ar.chooseTemplate}
        description={ar.templateHint}
      >
        <div className="grid gap-2">
          {COMPLAINT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="rounded-xl border border-border px-4 py-3 text-start transition hover:bg-muted"
              onClick={() => openFromTemplate(template.id)}
            >
              <span className="block text-sm font-semibold">{template.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{template.description}</span>
            </button>
          ))}
        </div>
      </Dialog>

      {!loaded ? (
        <Card className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </Card>
      ) : tabs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={ar.noRequestTabs}
            description={ar.requestsDescription}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => setTemplateOpen(true)}>
                  <FolderKanban className="size-4" />
                  {ar.addFromTemplate}
                </Button>
                <Button type="button" onClick={openCreate}>
                  <Plus className="size-4" />
                  {ar.addRequestTab}
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {tabs.map((t) => {
            const group = groupTitle(t.telegramGroupId);
            const fieldCount = (t.fields ?? []).length;
            return (
              <div
                key={t.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5 md:flex-row md:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <FolderKanban className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/requests/${t.id}`} className="font-semibold hover:text-primary hover:underline">
                        {t.name}
                      </Link>
                      <Badge tone={t.active ? "success" : "neutral"} dot>
                        {t.active ? ar.activated : ar.deactivated}
                      </Badge>
                    </div>
                    {t.description ? (
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{t.description}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <BotIcon className="size-3.5" aria-hidden />
                        <span className="sr-only">{ar.linkedBot}: </span>
                        {botName(t.botId)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="size-3.5" aria-hidden />
                        {ar.fieldsCount.replace("{count}", String(fieldCount))}
                      </span>
                      {group ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" aria-hidden />
                          {group}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                  <Link className={buttonClass("secondary", "sm")} href={`/requests/${t.id}`}>
                    {ar.manageOrders}
                  </Link>
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="size-3.5" />
                    {ar.editRequest}
                  </Button>
                  <Button
                    type="button"
                    variant="danger-ghost"
                    size="sm"
                    loading={busy === `delete:${t.id}`}
                    onClick={() => remove(t.id)}
                  >
                    <Trash2 className="size-3.5" />
                    {ar.delete}
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
