"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GitBranch,
  ImageIcon,
  ListChecks,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldHint, Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CardHeader, EmptyState } from "@/components/ui/card";
import type { BranchingRule } from "@/lib/requests/branching";
import { AuthImage } from "@/components/requests/auth-image";
import { TelegramMessageComposer } from "@/components/telegram/telegram-message-composer";
import { OptionsEditor } from "@/components/requests/options-editor";
import { canMoveField, moveField } from "@/lib/requests/field-order";
import type { FieldType, RequestField } from "@/types";
import { nextFieldName } from "@/lib/requests/field-names";
import {
  applyPromptBlocks,
  editorPromptBlocks,
  fieldAnswerHint,
  promptTextOf,
} from "@/lib/telegram/field-prompt";
export const FIELD_TYPES: FieldType[] = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "PHONE",
  "EMAIL",
  "PASSWORD",
  "URL",
  "DATE",
  "DATETIME",
  "SELECT",
  "RADIO",
  "CHECKBOX",
  "FILE",
  "IMAGE",
  "INSTRUCTION",
  "CONFIRMATION",
  "DYNAMIC",
];

export function createEmptyField(fields: RequestField[]): RequestField {
  const order = fields.length;
  return {
    id: crypto.randomUUID(),
    name: nextFieldName(fields),
    label: `حقل ${order + 1}`,
    type: "TEXT",
    required: true,
    sensitive: false,
    order,
    active: true,
    telegramMessage: "",
    options: [],
  };
}

function answerButtons(field: RequestField): string[] | undefined {
  if (field.type === "SELECT" || field.type === "RADIO" || field.type === "CHECKBOX") {
    return (field.options ?? []).map((o) => o.label);
  }
  if (field.type === "CONFIRMATION") return ["نعم", "لا"];
  return undefined;
}

function FieldRow({
  field,
  index,
  branchingCount,
  onEdit,
}: {
  field: RequestField;
  index: number;
  branchingCount: number;
  onEdit: () => void;
}) {
  const blocks = editorPromptBlocks(field);
  const image = blocks.find((b) => b.type === "image" && b.storageId);
  const text = promptTextOf(blocks);
  const hasText = blocks.some((b) => b.type === "text" && b.text.trim());
  const hasImage = blocks.some((b) => b.type === "image");
  const hasDocument = blocks.some((b) => b.type === "document");
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group flex w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start transition-colors hover:border-primary/40 hover:bg-primary-soft/40 sm:items-center"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold tabular-nums text-muted-foreground sm:mt-0">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold">{field.label || field.name}</span>
          <span className="truncate text-xs text-muted-foreground" dir="ltr">
            {field.name}
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{ar.fieldTypes[field.type]}</Badge>
          {field.required ? <Badge tone="primary">{ar.required}</Badge> : <Badge tone="neutral">{ar.optional}</Badge>}
          {branchingCount ? (
            <Badge tone="info">
              <GitBranch className="me-1 inline size-3" aria-hidden />
              {ar.hasBranching} · {branchingCount}
            </Badge>
          ) : null}
          {blocks.length ? (
            <Badge tone="accent">
              <MessageSquareText className="me-1 inline size-3" aria-hidden />
              {ar.hasTelegramContent}
              {hasText ? <Type className="ms-1 inline size-3" aria-label={ar.promptBlockText} /> : null}
              {hasImage ? <ImageIcon className="ms-1 inline size-3" aria-label={ar.promptBlockImage} /> : null}
              {hasDocument ? <FileText className="ms-1 inline size-3" aria-label={ar.promptBlockDocument} /> : null}
            </Badge>
          ) : null}
        </span>
        {text ? <span className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{text}</span> : null}
      </span>
      {image && image.type === "image" ? (
        <AuthImage
          fileId={image.storageId}
          className="hidden size-11 shrink-0 rounded-lg border border-border bg-muted/40 object-cover sm:block"
        />
      ) : null}
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors group-hover:bg-card group-hover:text-primary"
      >
        <Pencil className="size-4" />
      </span>
      <span className="sr-only">{ar.editField}</span>
    </button>
  );
}

export function FieldMoveButtons({
  index,
  canUp,
  canDown,
  onMove,
}: {
  index: number;
  canUp: boolean;
  canDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const n = String(index + 1);
  return (
    <div className="flex shrink-0 flex-col justify-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={ar.moveFieldUp.replace("{n}", n)}
        title={ar.moveUp}
        disabled={!canUp}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={ar.moveFieldDown.replace("{n}", n)}
        title={ar.moveDown}
        disabled={!canDown}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
}

function DialogSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function DynamicFieldsEditor({
  fields,
  branchingRules = [],
  onChange,
}: {
  fields: RequestField[];
  branchingRules?: BranchingRule[];
  onChange: (fields: RequestField[]) => void;
}) {
  function branchingCount(id: string) {
    return branchingRules.filter((r) => r.sourceFieldId === id || r.targetFieldId === id).length;
  }

  const [editingId, setEditingId] = useState<string | null>(null);

  const editingIndex = fields.findIndex((f) => f.id === editingId);
  const editing = editingIndex >= 0 ? fields[editingIndex] : null;
  const dialogOpen = Boolean(editing);

  function update(idx: number, patch: Partial<RequestField>) {
    onChange(fields.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function replaceField(idx: number, next: RequestField) {
    onChange(fields.map((x, i) => (i === idx ? next : x)));
  }

  function remove(idx: number) {
    const next = fields.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i }));
    onChange(next);
    setEditingId(null);
  }

  function addField() {
    const field = createEmptyField(fields);
    onChange([...fields, field]);
    setEditingId(field.id);
  }

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-card">
      <CardHeader
        icon={<ListChecks />}
        title={
          <>
            {ar.formFields}
            <span className="ms-1.5 text-xs font-normal text-muted-foreground tabular-nums">({fields.length})</span>
          </>
        }
        description={fields.length ? ar.formFieldsHint : undefined}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="size-3.5" />
            {ar.addField}
          </Button>
        }
      />

      <div className="p-3">
        {fields.length === 0 ? (
          <EmptyState
            className="py-8"
            icon={<ListChecks />}
            title={ar.fieldsListEmpty}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={addField}>
                <Plus className="size-3.5" />
                {ar.addField}
              </Button>
            }
          />
        ) : (
          <ol className="space-y-2">
            {fields.map((f, idx) => (
              <li key={f.id} className="flex items-stretch gap-1.5">
                <div className="min-w-0 flex-1">
                  <FieldRow field={f} index={idx} branchingCount={branchingCount(f.id)} onEdit={() => setEditingId(f.id)} />
                </div>
                <FieldMoveButtons
                  index={idx}
                  canUp={canMoveField(fields, idx, -1)}
                  canDown={canMoveField(fields, idx, 1)}
                  onMove={(direction) => onChange(moveField(fields, idx, direction))}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        title={ar.fieldDetails}
        description={
          editing ? `${ar.fieldTypes[editing.type]} · ${editing.name || ar.name}` : undefined
        }
        size="lg"
        nested
        footer={
          <>
            {editingIndex >= 0 ? (
              <Button
                type="button"
                variant="danger-ghost"
                className="me-auto"
                onClick={() => remove(editingIndex)}
              >
                <Trash2 className="size-4" />
                {ar.delete}
              </Button>
            ) : null}
            <Button type="button" onClick={() => setEditingId(null)}>
              {ar.done}
            </Button>
          </>
        }
      >
        {editing && editingIndex >= 0 ? (
          <div className="space-y-6">
            <DialogSection title={ar.basicInfo}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="field-label">{ar.displayName}</Label>
                  <Input
                    id="field-label"
                    value={editing.label}
                    onChange={(e) => update(editingIndex, { label: e.target.value })}
                    placeholder={ar.displayName}
                  />
                </div>
                <div>
                  <Label htmlFor="field-name">{ar.name}</Label>
                  <Input
                    id="field-name"
                    dir="ltr"
                    className="text-start"
                    value={editing.name}
                    onChange={(e) => update(editingIndex, { name: e.target.value })}
                    placeholder={ar.name}
                  />
                  <FieldHint>{ar.fieldNameHint}</FieldHint>
                </div>
                <div>
                  <Label htmlFor="field-type">{ar.type}</Label>
                  <Select
                    id="field-type"
                    value={editing.type}
                    onChange={(e) => {
                      const type = e.target.value as FieldType;
                      update(editingIndex, { type });
                    }}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ar.fieldTypes[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 self-end rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm transition-colors hover:border-border-strong">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={editing.required}
                    onChange={(e) => update(editingIndex, { required: e.target.checked })}
                  />
                  <span>
                    <span className="font-medium">{ar.required}</span>
                    <span className="block text-xs text-muted-foreground">{ar.requiredHint}</span>
                  </span>
                </label>
              </div>

              {(editing.type === "FILE" || editing.type === "IMAGE" || editing.type === "DYNAMIC") && (
                <p className="rounded-xl bg-info-soft px-3 py-2 text-xs leading-relaxed text-info">
                  {editing.type === "IMAGE"
                    ? "سيطلب البوت من المستخدم إرسال صورة (مثل QR)."
                    : editing.type === "DYNAMIC"
                      ? "يمكن للمستخدم إرسال أي محتوى تيليجرام مدعوم: نص، صورة، صوت، فيديو، ملف، موقع أو جهة اتصال."
                      : "سيطلب البوت من المستخدم إرسال ملف."}
                </p>
              )}
            </DialogSection>

            {(editing.type === "SELECT" || editing.type === "RADIO" || editing.type === "CHECKBOX") && (
              <DialogSection title={ar.answerOptions}>
                <OptionsEditor
                  field={editing}
                  rules={branchingRules}
                  onChange={(options) => update(editingIndex, { options })}
                />
              </DialogSection>
            )}

            <TelegramMessageComposer
              ownerId={editing.id}
              blocks={editorPromptBlocks(editing)}
              onChange={(blocks) => replaceField(editingIndex, applyPromptBlocks(editing, blocks))}
              fallbackLabel={editing.label || editing.name}
              hint={fieldAnswerHint(editing.type)}
              buttons={answerButtons(editing)}
            />

            <DialogSection title={ar.branching}>
              <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm">
                <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p>
                    {branchingCount(editing.id)
                      ? ar.fieldBranchingSummary.replace("{count}", String(branchingCount(editing.id)))
                      : ar.fieldBranchingNone}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ar.fieldBranchingManage}</p>
                </div>
              </div>
            </DialogSection>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
