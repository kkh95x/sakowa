"use client";

import { useEffect, useState } from "react";
import { FileIcon, Pencil, Trash2, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/i18n/ar";
import { useToast } from "@/components/ui/toast";
import { emptyAdminFields, parseAdminFields } from "@/lib/orders/admin-fields";
import type { OrderAdminFields } from "@/types";

const ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf";

export function AdminFieldsDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  value,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumber?: string;
  value?: OrderAdminFields | null;
  onSaved?: (next: OrderAdminFields) => void;
}) {
  const toast = useToast();
  const [adminNotes, setAdminNotes] = useState("");
  const [attachmentFileId, setAttachmentFileId] = useState<string | null>(null);
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [clearAttachment, setClearAttachment] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const parsed = parseAdminFields(value);
    setAdminNotes(parsed.adminNotes);
    setAttachmentFileId(parsed.attachmentFileId);
    setAttachmentFilename(parsed.attachmentFilename);
    setAttachmentFile(null);
    setClearAttachment(false);
  }, [open, value]);

  async function save() {
    if (!orderId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("adminNotes", adminNotes);
      if (attachmentFile) form.set("attachmentFile", attachmentFile);
      if (clearAttachment && !attachmentFile) form.set("clearAttachment", "true");
      const res = await fetch(`/api/orders/${orderId}/admin-fields`, {
        method: "PATCH",
        body: form,
      });
      if (!res.ok) {
        toast(ar.saveFailed);
        return;
      }
      const data = await res.json();
      const next = parseAdminFields(data.adminFields) || emptyAdminFields();
      onSaved?.(next);
      toast(ar.adminFieldsSaved);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const existing = attachmentFileId && !clearAttachment ? attachmentFileId : null;
  const hasFile = Boolean(attachmentFile || existing);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setAttachmentFile(file);
    setClearAttachment(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={ar.editAdminFields}
      description={orderNumber ? `${orderNumber} · ${ar.adminFieldsHint}` : ar.adminFieldsHint}
      size="md"
      footer={
        <>
          <Button type="button" onClick={() => void save()} loading={busy} disabled={!orderId}>
            {ar.save}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ar.cancel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="admin-notes">{ar.adminNotes}</Label>
          <Textarea
            id="admin-notes"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={4}
            maxLength={4000}
          />
        </div>
        <div>
          <Label>{ar.adminAttachment}</Label>
          {hasFile ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-border">
                <FileIcon className="size-4" />
              </span>
              {attachmentFile ? (
                <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                  {attachmentFile.name}
                </span>
              ) : (
                <a
                  className="min-w-0 flex-1 truncate text-sm text-primary underline-offset-2 hover:underline"
                  href={`/api/files/${existing}`}
                  target="_blank"
                  rel="noreferrer"
                  dir="auto"
                >
                  {attachmentFilename || ar.adminAttachment}
                </a>
              )}
              <div className="flex items-center gap-1">
                <label className={buttonClass("outline", "sm", "cursor-pointer")}>
                  {ar.replaceAdminAttachment}
                  <input type="file" accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={pickFile} />
                </label>
                <Button
                  type="button"
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => {
                    if (attachmentFile) setAttachmentFile(null);
                    else setClearAttachment(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {ar.removeAdminAttachment}
                </Button>
              </div>
            </div>
          ) : (
            <label className={buttonClass("outline", "md", "cursor-pointer border-dashed")}>
              <Upload className="size-4" />
              {ar.chooseAdminAttachment}
              <input type="file" accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={pickFile} />
            </label>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function AdminFieldsButton({
  onClick,
  className,
  compact = false,
}: {
  onClick: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size="sm"
      className={className}
      onClick={onClick}
      title={ar.editAdminFields}
    >
      <Pencil className="size-3.5" />
      {compact ? ar.adminFields : ar.editAdminFields}
    </Button>
  );
}
