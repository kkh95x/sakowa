"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, FileText, Upload } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, FieldHint, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { badgeDotClass } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { StatusBadge, statusTone } from "@/components/orders/status-badge";
import { cn } from "@/lib/utils";
import {
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  STATUS_ERROR_AR,
  STATUS_NOTE_MAX,
  TRANSITIONS,
  canonicalizeStatus,
  complaintStatusLabel,
  type ComplaintStatus,
} from "@/lib/orders/complaint-status";

const FILE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf";

const STATUS_DESCRIPTION: Record<ComplaintStatus, string> = {
  PENDING: "بانتظار المراجعة",
  REVIEWING: "بدء مراجعة الشكوى",
  IN_PROGRESS: "قبول الشكوى وبدء المعالجة",
  RESOLVED: "تمت معالجة المشكلة",
  CLOSED: "إنهاء دورة الشكوى نهائياً",
  REJECTED: "رفض الشكوى مع ذكر السبب",
};

export type StatusChangeValues = {
  reason: string;
  resolutionNote: string;
  closingNote: string;
  message: string;
};

const EMPTY_VALUES: StatusChangeValues = { reason: "", resolutionNote: "", closingNote: "", message: "" };

export function rejectionReasonError(reason: string) {
  const value = reason.trim();
  if (!value) return STATUS_ERROR_AR.REJECTION_REASON_REQUIRED;
  if (value.length < REJECTION_REASON_MIN) return STATUS_ERROR_AR.REJECTION_REASON_TOO_SHORT;
  if (value.length > REJECTION_REASON_MAX) return STATUS_ERROR_AR.REJECTION_REASON_TOO_LONG;
  return null;
}

/** Request body for the selected transition; only the note that belongs to the target is sent. */
export function statusChangePayload(
  status: ComplaintStatus,
  values: StatusChangeValues,
  attachmentFileId?: string,
) {
  return {
    status,
    ...(status !== "CLOSED" && values.message.trim() ? { message: values.message.trim() } : {}),
    ...(attachmentFileId ? { attachmentFileId } : {}),
    ...(status === "REJECTED" ? { reason: values.reason.trim() } : {}),
    ...(status === "RESOLVED" && values.resolutionNote.trim() ? { resolutionNote: values.resolutionNote.trim() } : {}),
    ...(status === "CLOSED" && values.closingNote.trim() ? { closingNote: values.closingNote.trim() } : {}),
  };
}

export function StatusChangeFields({
  currentStatus,
  selected,
  onSelect,
  values,
  onValueChange,
  file,
  onFileChange,
  reasonError,
  disabled = false,
}: {
  currentStatus: unknown;
  selected: ComplaintStatus | null;
  onSelect: (status: ComplaintStatus) => void;
  values: StatusChangeValues;
  onValueChange: (key: keyof StatusChangeValues, value: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  reasonError?: string | null;
  disabled?: boolean;
}) {
  const options = TRANSITIONS[canonicalizeStatus(currentStatus)] ?? [];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-3">
        <span className="text-sm text-muted-foreground">{ar.currentStatus}</span>
        <StatusBadge status={currentStatus} />
      </div>

      {options.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-3.5 py-4 text-center text-sm text-muted-foreground">
          {ar.terminalStatusHint}
        </p>
      ) : (
        <>
          <div aria-hidden className="flex justify-center text-muted-foreground/60">
            <ArrowDown className="size-4" />
          </div>
          <fieldset className="min-w-0" disabled={disabled}>
            <legend className="mb-2 text-sm font-medium">{ar.newStatus}</legend>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {options.map((status) => {
                const danger = status === "REJECTED";
                return (
                  <label
                    key={status}
                    className={cn(
                      "flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-border-strong",
                      "has-[:focus-visible]:ring-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                      danger
                        ? "has-[:checked]:border-danger has-[:checked]:bg-danger-soft has-[:focus-visible]:ring-danger/20"
                        : "has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-primary/20",
                    )}
                  >
                    <input
                      type="radio"
                      name="complaint-next-status"
                      value={status}
                      checked={selected === status}
                      onChange={() => onSelect(status)}
                      className={cn("mt-1 size-4 shrink-0", danger ? "accent-danger" : "accent-primary")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", badgeDotClass(statusTone(status)))} />
                        {complaintStatusLabel(status)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {STATUS_DESCRIPTION[status]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </>
      )}

      {selected ? (
        <section aria-label={ar.transitionDetails} className="min-w-0 space-y-4 border-t border-border pt-4">
          {selected === "REJECTED" ? (
            <div>
              <Label htmlFor="status-reason">
                {ar.rejectionReason} <span className="text-danger" aria-hidden>*</span>
              </Label>
              <Textarea
                id="status-reason"
                value={values.reason}
                onChange={(e) => onValueChange("reason", e.target.value)}
                rows={3}
                maxLength={REJECTION_REASON_MAX}
                required
                aria-required="true"
                aria-invalid={reasonError ? true : undefined}
                aria-describedby="status-reason-hint status-reason-error"
                disabled={disabled}
              />
              <div id="status-reason-error" aria-live="polite">
                <FieldError>{reasonError}</FieldError>
              </div>
              <div id="status-reason-hint">
                <FieldHint>{ar.rejectionReasonHint}</FieldHint>
              </div>
            </div>
          ) : null}

          {selected === "RESOLVED" ? (
            <div>
              <Label htmlFor="status-resolution-note">
                {ar.resolutionNote} <span className="font-normal text-muted-foreground">({ar.optional})</span>
              </Label>
              <Textarea
                id="status-resolution-note"
                value={values.resolutionNote}
                onChange={(e) => onValueChange("resolutionNote", e.target.value)}
                rows={3}
                maxLength={STATUS_NOTE_MAX}
                aria-describedby="status-resolution-hint"
                disabled={disabled}
              />
              <div id="status-resolution-hint">
                <FieldHint>{ar.resolutionNoteHint}</FieldHint>
              </div>
            </div>
          ) : null}

          {selected === "CLOSED" ? (
            <div>
              <Label htmlFor="status-closing-note">
                {ar.closingNote} <span className="font-normal text-muted-foreground">({ar.optional})</span>
              </Label>
              <Textarea
                id="status-closing-note"
                value={values.closingNote}
                onChange={(e) => onValueChange("closingNote", e.target.value)}
                rows={3}
                maxLength={STATUS_NOTE_MAX}
                aria-describedby="status-closing-hint"
                disabled={disabled}
              />
              <div id="status-closing-hint">
                <FieldHint>{ar.closingNoteHint}</FieldHint>
                <FieldHint>{ar.closingNoUserNotice}</FieldHint>
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="status-message">{ar.statusChangeMessage}</Label>
                <Textarea
                  id="status-message"
                  value={values.message}
                  onChange={(e) => onValueChange("message", e.target.value)}
                  rows={3}
                  maxLength={4000}
                  disabled={disabled}
                />
              </div>
              <StatusFilePicker file={file} onChange={onFileChange} disabled={disabled} />
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StatusFilePicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      {file ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/30 p-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-border">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
            {file.name}
          </span>
          <Button type="button" variant="danger-ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
            {ar.delete}
          </Button>
        </div>
      ) : (
        <label className={buttonClass("outline", "md", cn("cursor-pointer border-dashed", disabled && "pointer-events-none opacity-50"))}>
          <Upload className="size-4" />
          {ar.attachFile}
          <input
            type="file"
            accept={FILE_ACCEPT}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              onChange(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {!file ? <FieldHint>{ar.statusChangeFileHint}</FieldHint> : null}
    </div>
  );
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  currentStatus,
  nested = false,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  orderNumber?: string;
  currentStatus: unknown;
  nested?: boolean;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<ComplaintStatus | null>(null);
  const [values, setValues] = useState<StatusChangeValues>(EMPTY_VALUES);
  const [file, setFile] = useState<File | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setValues(EMPTY_VALUES);
    setFile(null);
    setReasonError(null);
  }, [open, orderId]);

  function setValue(key: keyof StatusChangeValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "reason" && reasonError) setReasonError(rejectionReasonError(value));
  }

  function select(status: ComplaintStatus) {
    setSelected(status);
    setReasonError(null);
  }

  function focusReason() {
    requestAnimationFrame(() => document.getElementById("status-reason")?.focus());
  }

  async function submit() {
    if (!orderId || busyRef.current) return;
    if (!selected) {
      toast(ar.chooseStatusFirst, "error");
      return;
    }
    if (selected === "REJECTED") {
      const error = rejectionReasonError(values.reason);
      if (error) {
        setReasonError(error);
        focusReason();
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    try {
      let attachmentFileId: string | undefined;
      if (file && selected !== "CLOSED") {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("ownerId", orderId);
        const up = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!up.ok) {
          toast(ar.updateFailed, "error");
          return;
        }
        attachmentFileId = String((await up.json()).fileId);
      }
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusChangePayload(selected, values, attachmentFileId)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const message = data.message || ar.updateFailed;
        if (data.error?.startsWith("REJECTION_REASON")) {
          setReasonError(message);
          focusReason();
        }
        toast(message, "error");
        if (data.error === "STATUS_CONFLICT") {
          onOpenChange(false);
          onChanged?.();
        }
        return;
      }
      toast(ar.toast.orderUpdated, "success");
      onOpenChange(false);
      onChanged?.();
    } catch {
      toast(ar.updateFailed, "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const rejecting = selected === "REJECTED";
  const hasOptions = (TRANSITIONS[canonicalizeStatus(currentStatus)] ?? []).length > 0;

  return (
    <Dialog
      nested={nested}
      open={open}
      onOpenChange={(next) => {
        if (!next && busyRef.current) return;
        onOpenChange(next);
      }}
      title={orderNumber ? `${ar.changeStatus} · ${orderNumber}` : ar.changeStatus}
      description={ar.statusPickHint}
      size="md"
      footer={
        <>
          {hasOptions ? (
            <Button
              type="submit"
              form="status-change-form"
              variant={rejecting ? "danger" : "primary"}
              loading={busy}
              disabled={!selected}
              className="max-sm:flex-1"
            >
              {rejecting ? ar.confirmRejection : ar.confirmStatusChange}
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)} className="max-sm:flex-1">
            {ar.cancel}
          </Button>
        </>
      }
    >
      <form
        id="status-change-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <StatusChangeFields
          currentStatus={currentStatus}
          selected={selected}
          onSelect={select}
          values={values}
          onValueChange={setValue}
          file={file}
          onFileChange={setFile}
          reasonError={reasonError}
          disabled={busy}
        />
      </form>
    </Dialog>
  );
}
