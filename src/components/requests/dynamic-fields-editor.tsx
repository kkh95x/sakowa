"use client";

import { useEffect, useState } from "react";
import { FileText, ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldType, RequestField } from "@/types";
import { nextFieldName } from "@/lib/requests/field-names";
import { cn } from "@/lib/utils";

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

function AuthImage({
  fileId,
  localUrl,
  className,
}: {
  fileId?: string | null;
  localUrl?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(localUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (localUrl) {
      setSrc(localUrl);
      setFailed(false);
      return;
    }
    if (!fileId) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void (async () => {
      try {
        const res = await fetch(`/api/files/${fileId}`, { credentials: "include" });
        if (!res.ok) throw new Error("load_failed");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, localUrl]);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageIcon className="size-8 opacity-50" />
      </div>
    );
  }
  if (!src) {
    return <div className={cn("animate-pulse bg-muted", className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className} />
  );
}

function FieldMediaCard({
  field,
  localPreviewUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  field: RequestField;
  localPreviewUrl?: string | null;
  uploading: boolean;
  onUpload: (file: File | null) => void;
  onRemove: () => void;
}) {
  const mediaId = field.imageFileId || field.attachmentFileId;
  const isImage = Boolean(field.imageFileId || localPreviewUrl);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{ar.fieldPromptFile}</div>
          <p className="text-xs text-muted-foreground">{ar.fieldPromptFileHint}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
          <Upload className="size-3.5" />
          {uploading ? ar.loading : ar.attachFileToField}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              onUpload(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {mediaId || localPreviewUrl ? (
        <div className="p-4">
          {isImage ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <AuthImage
                fileId={field.imageFileId}
                localUrl={localPreviewUrl}
                className="max-h-56 min-h-40 w-full object-contain"
              />
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                {mediaId ? (
                  <a
                    href={`/api/files/${mediaId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    {ar.viewAttachedFile}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{ar.preview}</span>
                )}
                <Button type="button" variant="ghost" className="h-8 text-danger" onClick={onRemove}>
                  {ar.removeAttachedFile}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                <FileText className="size-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{ar.attachedFile}</div>
                {mediaId ? (
                  <a
                    href={`/api/files/${mediaId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    {ar.viewAttachedFile}
                  </a>
                ) : null}
              </div>
              <Button type="button" variant="ghost" className="text-danger" onClick={onRemove}>
                {ar.removeAttachedFile}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <ImageIcon className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{ar.noFieldMedia}</p>
        </div>
      )}
    </div>
  );
}

export function DynamicFieldsEditor({
  fields,
  onChange,
}: {
  fields: RequestField[];
  onChange: (fields: RequestField[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});

  const editingIndex = fields.findIndex((f) => f.id === editingId);
  const editing = editingIndex >= 0 ? fields[editingIndex] : null;
  const dialogOpen = Boolean(editing);

  function clearLocalPreview(fieldId: string) {
    setLocalPreviews((prev) => {
      const url = prev[fieldId];
      if (url) URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  function update(idx: number, patch: Partial<RequestField>) {
    onChange(fields.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function remove(idx: number) {
    const fieldId = fields[idx]?.id;
    if (fieldId) clearLocalPreview(fieldId);
    const next = fields.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i }));
    onChange(next);
    setEditingId(null);
  }

  function addField() {
    const field = createEmptyField(fields);
    onChange([...fields, field]);
    setEditingId(field.id);
  }

  async function uploadFieldMedia(idx: number, file: File | null) {
    if (!file) return;
    const fieldId = fields[idx]?.id;
    if (!fieldId) return;

    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setLocalPreviews((prev) => {
        if (prev[fieldId]) URL.revokeObjectURL(prev[fieldId]);
        return { ...prev, [fieldId]: previewUrl };
      });
    } else {
      clearLocalPreview(fieldId);
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ownerId", fieldId);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        clearLocalPreview(fieldId);
        return;
      }
      const data = await res.json();
      const fileId = String(data.fileId);
      const isImage = String(data.mimeType ?? "").startsWith("image/");
      update(
        idx,
        isImage
          ? { imageFileId: fileId, attachmentFileId: undefined }
          : { attachmentFileId: fileId, imageFileId: undefined },
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="text-sm font-semibold">
          {ar.fields}
          <span className="ms-1 text-xs font-normal text-muted-foreground">({fields.length})</span>
        </div>
        <Button type="button" variant="outline" className="h-8 gap-1 px-2.5 text-xs" onClick={addField}>
          <Plus className="size-3.5" />
          {ar.addField}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {fields.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{ar.fieldsListEmpty}</p>
            <Button type="button" variant="outline" onClick={addField}>
              <Plus className="size-4" />
              {ar.addField}
            </Button>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((f, idx) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setEditingId(f.id)}
                  className={cn(
                    "group flex w-full flex-col gap-2 rounded-2xl border border-border bg-muted/25 p-3 text-start transition hover:border-primary/40 hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {idx + 1}. {f.label || f.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{ar.fieldTypes[f.type]}</div>
                    </div>
                    <span className="rounded-lg bg-card p-1.5 text-muted-foreground group-hover:text-primary">
                      <Pencil className="size-3.5" />
                    </span>
                  </div>
                  {f.imageFileId || localPreviews[f.id] ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                      <AuthImage
                        fileId={f.imageFileId}
                        localUrl={localPreviews[f.id]}
                        className="h-28 w-full object-contain bg-muted/40"
                      />
                    </div>
                  ) : f.attachmentFileId ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground">
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{ar.attachedFile}</span>
                    </div>
                  ) : f.telegramMessage ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{f.telegramMessage}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
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
                variant="ghost"
                className="me-auto text-danger"
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
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{ar.displayName}</Label>
                <Input
                  value={editing.label}
                  onChange={(e) => update(editingIndex, { label: e.target.value })}
                  placeholder={ar.displayName}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ar.name}</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => update(editingIndex, { name: e.target.value })}
                  placeholder={ar.name}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ar.type}</Label>
                <select
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
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
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{ar.telegramMessage}</Label>
                <textarea
                  value={editing.telegramMessage ?? ""}
                  onChange={(e) => update(editingIndex, { telegramMessage: e.target.value })}
                  placeholder={ar.telegramMessage}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </div>
            </div>

            {(editing.type === "FILE" || editing.type === "IMAGE") && (
              <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                {editing.type === "IMAGE"
                  ? "سيطلب البوت من المستخدم إرسال صورة (مثل QR)."
                  : "سيطلب البوت من المستخدم إرسال ملف."}
              </p>
            )}

            {(editing.type === "SELECT" || editing.type === "RADIO" || editing.type === "CHECKBOX") && (
              <div className="space-y-1.5">
                <Label>{ar.optionsHint}</Label>
                <Input
                  value={(editing.options ?? []).map((o) => o.label).join(", ")}
                  onChange={(e) =>
                    update(editingIndex, {
                      options: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((label) => ({ label, value: label })),
                    })
                  }
                  placeholder={ar.optionsHint}
                />
              </div>
            )}

            <FieldMediaCard
              field={editing}
              localPreviewUrl={localPreviews[editing.id]}
              uploading={uploading}
              onUpload={(file) => void uploadFieldMedia(editingIndex, file)}
              onRemove={() => {
                clearLocalPreview(editing.id);
                update(editingIndex, { imageFileId: undefined, attachmentFileId: undefined });
              }}
            />

            <div className="flex flex-wrap gap-6 rounded-2xl border border-border bg-muted/25 px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={editing.required}
                  onChange={(e) => update(editingIndex, { required: e.target.checked })}
                />
                {ar.required}
              </label>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
