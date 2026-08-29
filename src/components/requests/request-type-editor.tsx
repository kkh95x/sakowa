"use client";

import { useEffect, useState } from "react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { FieldType, RequestField } from "@/types";
import { nextFieldName } from "@/lib/requests/field-names";

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

export type RequestTypeEditorValue = {
  id: string;
  name: string;
  botId: string;
  description?: string;
  fields: RequestField[];
  active: boolean;
  telegramGroupId?: string | null;
};

export function RequestTypeEditor({
  value,
  onSaved,
}: {
  value: RequestTypeEditorValue;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(value.name);
  const [botId, setBotId] = useState(value.botId);
  const [description, setDescription] = useState(value.description ?? "");
  const [fields, setFields] = useState<RequestField[]>(value.fields ?? []);
  const [bots, setBots] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; title: string; chatId?: number; messageThreadId?: number | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    setName(value.name);
    setBotId(value.botId);
    setDescription(value.description ?? "");
    setFields(value.fields ?? []);
  }, [value]);

  useEffect(() => {
    Promise.all([fetch("/api/bots"), fetch("/api/telegram/groups")]).then(async ([b, g]) => {
      const bj = await b.json();
      const gj = await g.json();
      setBots(bj.bots ?? []);
      setGroups(gj.groups ?? []);
    });
  }, []);

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

  async function save() {
    setSaving(true);
    const meta = await fetch(`/api/request-types/${value.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, botId }),
    });
    const fieldsRes = await fetch(`/api/request-types/${value.id}/fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    setSaving(false);
    if (!meta.ok || !fieldsRes.ok) return toast(ar.saveFailed);
    toast(ar.requestUpdated);
    onSaved?.();
  }

  async function activate(active: boolean) {
    setActivating(active ? "on" : "off");
    await fetch(`/api/request-types/${value.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setActivating(null);
    toast(active ? ar.activated : ar.deactivated);
    onSaved?.();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>{ar.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>{ar.selectBot}</Label>
            <select
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>{ar.details}</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </div>
          <div className="md:col-span-2">
            <Label>{ar.groups}</Label>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              value={value.telegramGroupId ?? ""}
              onChange={async (e) => {
                const res = await fetch(`/api/request-types/${value.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ telegramGroupId: e.target.value || null }),
                });
                toast(res.ok ? ar.linked : ar.linkFailed);
                onSaved?.();
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
        </div>
        <div className="flex items-center justify-between">
          <div className="font-semibold">{ar.builder}</div>
          <Button type="button" variant="outline" onClick={addField}>
            {ar.addField}
          </Button>
        </div>
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
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving}>
            {saving ? ar.loading : ar.save}
          </Button>
          <Button variant="secondary" onClick={() => activate(true)} loading={activating === "on"}>
            {ar.activate}
          </Button>
          <Button variant="outline" onClick={() => activate(false)} loading={activating === "off"}>
            {ar.deactivate}
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 font-semibold">{ar.preview}</div>
        <div className="mx-auto max-w-[240px] rounded-[1.75rem] border-4 border-secondary bg-[#0e1621] p-3 text-sm text-white shadow-lg">
          <div className="mb-3 text-center text-xs text-white/60">Telegram</div>
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.id} className="rounded-2xl rounded-se-md bg-[#182533] px-3 py-2">
                {f.telegramMessage || f.label}
              </div>
            ))}
            {fields.length === 0 && <div className="text-center text-xs text-white/50">—</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
