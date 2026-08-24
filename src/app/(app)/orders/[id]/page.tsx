"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Ban, MessageSquare, Paperclip, RefreshCw } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { FieldAnswerMedia } from "@/components/orders/field-answer-media";
import { parseFieldAnswer } from "@/lib/orders/field-answer";
import type { OrderStatus, RequestField } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: ar.pending,
  REVIEWING: ar.reviewing,
  COMPLETED: ar.completed,
  REJECTED: ar.rejected,
  ARCHIVED: ar.archived,
};

const TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING: ["REVIEWING", "REJECTED", "ARCHIVED"],
  REVIEWING: ["COMPLETED", "REJECTED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: [],
};

type DialogKind = "status" | "message" | "attach" | "block" | null;

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [message, setMessage] = useState("");
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/orders/${id}`);
    setData(await res.json());
  }

  useEffect(() => {
    load();
  }, [id]);

  const order = data?.order as Record<string, unknown> | undefined;
  const history = (data?.history as Record<string, unknown>[]) ?? [];
  const requestType = data?.requestType as
    | { id: string; name: string; fields?: RequestField[] }
    | null
    | undefined;

  const fieldRows = useMemo(() => {
    const defs = [...(requestType?.fields ?? [])]
      .filter((f) => f.active !== false && f.type !== "INSTRUCTION")
      .sort((a, b) => a.order - b.order);
    const values = (order?.fields as Record<string, unknown>) ?? {};
    if (defs.length) {
      return defs.map((f) => ({
        key: f.name,
        label: f.label || f.name,
        question: f.telegramMessage || f.label || f.name,
        type: f.type,
        answer: parseFieldAnswer(values[f.name], f.type),
      }));
    }
    return Object.entries(values).map(([key, value]) => ({
      key,
      label: key,
      question: key,
      type: "TEXT",
      answer: parseFieldAnswer(value),
    }));
  }, [order, requestType]);

  const nextStatuses = order ? TRANSITIONS[String(order.status)] ?? [] : [];

  function closeDialog() {
    setDialog(null);
    setMessage("");
    setStatusFile(null);
    setAttachFile(null);
    setReason("");
  }

  async function change(status: OrderStatus) {
    setBusy(`status:${status}`);
    let attachmentFileId: string | undefined;
    if (statusFile) {
      const fd = new FormData();
      fd.append("file", statusFile);
      fd.append("ownerId", id);
      const up = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!up.ok) {
        setBusy(null);
        toast(ar.updateFailed);
        return;
      }
      const upData = await up.json();
      attachmentFileId = String(upData.fileId);
    }
    const res = await fetch(`/api/orders/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        message: message || undefined,
        attachmentFileId,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      toast(ar.updateFailed);
      return;
    }
    toast(ar.toast.orderUpdated);
    closeDialog();
    load();
  }

  async function sendMessage() {
    if (!message.trim() && !attachFile) return;
    setBusy("message");
    try {
      let fileId: string | undefined;
      if (attachFile) {
        const fd = new FormData();
        fd.append("file", attachFile);
        fd.append("ownerId", id);
        const up = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!up.ok) {
          toast(ar.sendFailed);
          return;
        }
        const upData = await up.json();
        fileId = String(upData.fileId);
      }
      const res = await fetch(`/api/orders/${id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim() || undefined,
          fileId,
        }),
      });
      toast(res.ok ? ar.messageSent : ar.sendFailed);
      if (res.ok) {
        closeDialog();
        load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function block() {
    if (!order) return;
    setBusy("block");
    const res = await fetch("/api/blocked-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: order.telegramUserId,
        username: order.telegramUsername,
        firstName: order.telegramName,
        botId: order.botId,
        requestTypeId: order.requestTypeId,
        reason,
      }),
    });
    setBusy(null);
    toast(res.ok ? ar.toast.userBlocked : "تعذر الحظر");
    if (res.ok) closeDialog();
  }

  async function uploadAttachment() {
    if (!attachFile) return;
    const fd = new FormData();
    fd.append("file", attachFile);
    setBusy("upload");
    const res = await fetch(`/api/orders/${id}/attachments`, { method: "POST", body: fd });
    setBusy(null);
    toast(res.ok ? ar.toast.fileUploaded : "فشل الرفع");
    if (res.ok) {
      closeDialog();
      load();
    }
  }

  if (!order) return <div className="text-sm text-muted-foreground">{ar.loading}</div>;

  const telegramHref = order.telegramUsername
    ? `https://t.me/${String(order.telegramUsername).replace(/^@/, "")}`
    : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{String(order.orderNumber)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {requestType?.name ? `${requestType.name} · ` : null}
              {STATUS_LABEL[String(order.status)] ?? String(order.status)}
            </p>
          </div>
          <div className="rounded-2xl bg-muted/60 px-3 py-2 text-sm">
            {formatTime(String(order.createdAt))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">{ar.telegramName}</div>
            <div className="font-medium">{String(order.telegramName || "—")}</div>
          </div>
          <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">{ar.telegramUsername}</div>
            <div className="font-medium">
              {telegramHref ? (
                <a className="text-primary underline" href={telegramHref} target="_blank" rel="noreferrer">
                  @{String(order.telegramUsername)}
                </a>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">{ar.telegramId}</div>
            <div className="font-medium">{String(order.telegramUserId)}</div>
          </div>
          <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">{ar.status}</div>
            <div className="font-medium">{STATUS_LABEL[String(order.status)]}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{ar.answers}</h2>
        {fieldRows.map((row) => (
          <div key={row.key} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/35 px-4 py-3">
              <div className="text-sm font-semibold">{row.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {ar.userQuestion}: {row.question}
              </div>
            </div>
            <div className="px-4 py-4">
              <div className="text-xs font-medium text-muted-foreground">{ar.userAnswer}</div>
              {row.answer.kind === "text" || row.answer.kind === "empty" ? (
                <div className="mt-1 text-base font-medium leading-relaxed">{row.answer.text}</div>
              ) : null}
              <FieldAnswerMedia orderId={id} fieldName={row.key} answer={row.answer} />
            </div>
          </div>
        ))}
        {fieldRows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">—</div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 font-semibold">{ar.timeline}</div>
        <ol className="space-y-2">
          {history.map((h, i) => (
            <li key={i} className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium">
                {STATUS_LABEL[String(h.previousStatus)] ?? String(h.previousStatus ?? "—")}
                {" → "}
                {STATUS_LABEL[String(h.newStatus)] ?? String(h.newStatus)}
              </div>
              {h.message ? <div className="mt-1 text-xs text-muted-foreground">{String(h.message)}</div> : null}
              {h.attachmentFileId ? (
                <a
                  className="mt-1 inline-block text-xs text-primary underline"
                  href={`/api/files/${String(h.attachmentFileId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {ar.viewAttachedFile}
                </a>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">{formatTime(String(h.createdAt))}</div>
            </li>
          ))}
          {history.length === 0 ? <li className="text-sm text-muted-foreground">—</li> : null}
        </ol>
      </div>

      <div className="sticky bottom-3 z-10 rounded-3xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setDialog("status")} disabled={nextStatuses.length === 0}>
            <RefreshCw className="size-4" />
            {ar.changeStatus}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDialog("message")}>
            <MessageSquare className="size-4" />
            {ar.sendMessage}
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialog("attach")}>
            <Paperclip className="size-4" />
            {ar.attachFile}
          </Button>
          <Button type="button" variant="danger" onClick={() => setDialog("block")}>
            <Ban className="size-4" />
            {ar.block}
          </Button>
        </div>
      </div>

      <Dialog
        open={dialog === "status"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("status"))}
        title={ar.changeStatus}
        description={ar.statusChangeMessage}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>{ar.statusChangeMessage}</Label>
            <textarea
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
              placeholder={ar.statusChangeMessage}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="cursor-pointer rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
              {ar.attachFile}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf"
                className="hidden"
                onChange={(e) => setStatusFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {statusFile ? (
              <span className="text-xs text-muted-foreground">
                {statusFile.name}
                <button type="button" className="ms-2 text-danger" onClick={() => setStatusFile(null)}>
                  {ar.delete}
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{ar.statusChangeFileHint}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <Button key={s} variant="outline" loading={busy === `status:${s}`} onClick={() => change(s)}>
                {STATUS_LABEL[s]}
              </Button>
            ))}
            {nextStatuses.length === 0 ? (
              <div className="text-xs text-muted-foreground">{ar.noTransitions}</div>
            ) : null}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "message"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("message"))}
        title={ar.sendMessage}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
            <Button
              type="button"
              loading={busy === "message"}
              disabled={!message.trim() && !attachFile}
              onClick={sendMessage}
            >
              {ar.sendMessage}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>{ar.sendMessage}</Label>
            <textarea
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder={ar.statusChangeMessage}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="cursor-pointer rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
              {ar.attachFile}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf"
                className="hidden"
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {attachFile ? (
              <span className="text-xs text-muted-foreground">
                {attachFile.name}
                <button type="button" className="ms-2 text-danger" onClick={() => setAttachFile(null)}>
                  {ar.delete}
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{ar.statusChangeFileHint}</span>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "attach"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("attach"))}
        title={ar.attachFile}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
            <Button type="button" loading={busy === "upload"} disabled={!attachFile} onClick={uploadAttachment}>
              {ar.attachFile}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Label>{ar.attachFile}</Label>
          <input
            type="file"
            className="block w-full text-sm"
            onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
          />
          {attachFile ? <div className="text-xs text-muted-foreground">{attachFile.name}</div> : null}
        </div>
      </Dialog>

      <Dialog
        open={dialog === "block"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("block"))}
        title={ar.block}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
            <Button type="button" variant="danger" loading={busy === "block"} onClick={block}>
              {ar.block}
            </Button>
          </>
        }
      >
        <div>
          <Label>{ar.reason}</Label>
          <Input className="mt-1" placeholder={ar.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}
