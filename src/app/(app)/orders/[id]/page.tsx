"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Ban,
  ChevronLeft,
  ClipboardList,
  FileText,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RefreshCw,
  Upload,
  UserRound,
} from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea, FieldHint } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/card";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { cn, formatTime, relativeTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { FieldAnswerMedia } from "@/components/orders/field-answer-media";
import { OrderChatDialog } from "@/components/orders/order-chat-dialog";
import { AdminFieldsDialog } from "@/components/orders/admin-fields-dialog";
import { StatusBadge } from "@/components/orders/status-badge";
import { StatusChangeDialog } from "@/components/orders/status-change-dialog";
import { StatusHistoryItem, latestStatusContext, StatusContextNotes } from "@/components/orders/status-history";
import { buildOrderFieldRows } from "@/lib/orders/order-field-rows";
import { parseAdminFields } from "@/lib/orders/admin-fields";
import { TRANSITIONS, canonicalizeStatus } from "@/lib/orders/complaint-status";
import type { OrderAdminFields, RequestField } from "@/types";

const FILE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf";

type DialogKind = "status" | "message" | "attach" | "block" | null;

function referencedFileIds(values: Record<string, unknown>) {
  const ids = new Set<string>();
  for (const value of Object.values(values)) {
    if (value && typeof value === "object") {
      const v = value as { storageId?: unknown; gridFsId?: unknown };
      if (v.storageId) ids.add(String(v.storageId));
      if (v.gridFsId) ids.add(String(v.gridFsId));
    }
  }
  return ids;
}

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [message, setMessage] = useState("");
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

  const fieldRows = useMemo(
    () =>
      buildOrderFieldRows(
        (order?.fields as Record<string, unknown>) ?? {},
        requestType?.fields ?? [],
        order?.formFields,
      ),
    [order, requestType],
  );

  const extraFiles = useMemo(() => {
    const all = ((order?.attachments as unknown[]) ?? []).map(String).filter(Boolean);
    const used = referencedFileIds((order?.fields as Record<string, unknown>) ?? {});
    for (const h of history) if (h.attachmentFileId) used.add(String(h.attachmentFileId));
    return [...new Set(all)].filter((fileId) => !used.has(fileId));
  }, [order, history]);

  const nextStatuses = order ? TRANSITIONS[canonicalizeStatus(order.status)] ?? [] : [];
  const adminFields = parseAdminFields(order?.adminFields);

  const statusContext = order ? latestStatusContext(history, order.status) : null;

  function closeDialog() {
    setDialog(null);
    setMessage("");
    setAttachFile(null);
    setReason("");
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

  if (!order) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const orderId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : null;
  const telegramHref = order.telegramUsername
    ? `https://t.me/${String(order.telegramUsername).replace(/^@/, "")}`
    : null;
  const canChangeStatus = nextStatuses.length > 0;

  const moreMenu = (
    <Dropdown
      trigger={
        <Button variant="outline" size="icon" aria-label={ar.moreActions} title={ar.moreActions}>
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      <DropdownItem icon={<MessageSquare />} onSelect={() => setDialog("message")}>
        {ar.sendMessage}
      </DropdownItem>
      <DropdownItem icon={<Paperclip />} onSelect={() => setDialog("attach")}>
        {ar.attachFile}
      </DropdownItem>
      <DropdownItem icon={<ClipboardList />} onSelect={() => setAdminOpen(true)}>
        {ar.editAdminFields}
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem icon={<Ban />} danger onSelect={() => setDialog("block")}>
        {ar.block}
      </DropdownItem>
    </Dropdown>
  );

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <Card className="p-4 sm:p-5">
        <nav aria-label={ar.navComplaints} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{ar.navComplaints}</span>
          {requestType?.id ? (
            <>
              <ChevronLeft className="size-3.5" />
              <Link href={`/requests/${requestType.id}?status=${canonicalizeStatus(order.status)}`} className="hover:text-primary">
                {requestType.name}
              </Link>
            </>
          ) : null}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tabular-nums tracking-tight sm:text-2xl" dir="ltr">
                {String(order.orderNumber)}
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {requestType?.name ? (
                <div className="flex gap-1.5">
                  <dt className="sr-only">{ar.complaintType}</dt>
                  <dd className="font-medium text-foreground/80">{requestType.name}</dd>
                </div>
              ) : null}
              <div className="flex gap-1.5">
                <dt>{ar.createdAt}:</dt>
                <dd>{formatTime(String(order.createdAt))}</dd>
              </div>
              {order.updatedAt ? (
                <div className="flex gap-1.5">
                  <dt>{ar.lastUpdated}:</dt>
                  <dd>{relativeTime(String(order.updatedAt))}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <Button onClick={() => setDialog("status")} disabled={!canChangeStatus}>
              <RefreshCw className="size-4" />
              {ar.changeStatus}
            </Button>
            <Button variant="secondary" onClick={() => setChatOpen(true)}>
              <MessageCircle className="size-4" />
              {ar.openConversation}
            </Button>
            {moreMenu}
          </div>
        </div>
        {statusContext ? <StatusContextNotes entry={statusContext} className="mt-4" /> : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title={ar.complaintContent} icon={<FileText />} />
            {fieldRows.length === 0 ? (
              <EmptyState title="—" className="py-8" />
            ) : (
              <ol className="divide-y divide-border">
                {fieldRows.map((row) => {
                  const plain =
                    row.answer.kind === "text" ||
                    row.answer.kind === "empty" ||
                    row.answer.kind === "location" ||
                    row.answer.kind === "contact" ||
                    row.answer.kind === "other";
                  return (
                    <li key={row.key} className="px-4 py-4 sm:px-5">
                      <div className="text-sm font-semibold text-foreground">
                        {row.label}
                        {row.historical ? (
                          <span className="ms-2 text-xs font-normal text-muted-foreground">({ar.historicalField})</span>
                        ) : null}
                      </div>
                      {row.question && row.question !== row.label ? (
                        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {ar.userQuestion}: {row.question}
                        </div>
                      ) : null}
                      <div className="mt-2">
                        {plain ? (
                          <div
                            className={cn(
                              "whitespace-pre-wrap break-words leading-relaxed",
                              row.answer.kind === "empty" ? "text-muted-foreground/70" : "text-[15px] text-foreground",
                            )}
                          >
                            {row.answer.text}
                          </div>
                        ) : null}
                        <FieldAnswerMedia orderId={id} fieldName={row.key} answer={row.answer} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {extraFiles.length > 0 ? (
            <Card>
              <CardHeader title={ar.additionalFiles} icon={<Paperclip />} />
              <ul className="flex flex-wrap gap-2 p-4 sm:px-5">
                {extraFiles.map((fileId, i) => (
                  <li key={fileId}>
                    <a
                      href={`/api/files/${fileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass("outline", "sm")}
                    >
                      <FileText className="size-3.5 text-primary" />
                      {ar.fileN} {i + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={ar.timeline} icon={<RefreshCw />} />
            {history.length === 0 ? (
              <EmptyState title={ar.noActivity} className="py-8" />
            ) : (
              <ol className="px-4 py-4 sm:px-5">
                {history.map((h, i) => (
                  <StatusHistoryItem key={String(h._id ?? i)} entry={h} last={i === history.length - 1} />
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title={ar.complainantInfo} icon={<UserRound />} />
            <dl className="space-y-3 px-4 py-4 text-sm sm:px-5">
              <div>
                <dt className="text-xs text-muted-foreground">{ar.telegramName}</dt>
                <dd className="mt-0.5 font-medium">{String(order.telegramName || "—")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{ar.telegramUsername}</dt>
                <dd className="mt-0.5 font-medium">
                  {telegramHref ? (
                    <a className="text-primary hover:underline" href={telegramHref} target="_blank" rel="noreferrer" dir="ltr">
                      @{String(order.telegramUsername).replace(/^@/, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{ar.telegramId}</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  <span dir="ltr">{String(order.telegramUserId)}</span>
                </dd>
              </div>
            </dl>
            <div className="border-t border-border p-3">
              <Button variant="secondary" className="w-full" onClick={() => setChatOpen(true)}>
                <MessageCircle className="size-4" />
                {ar.openConversation}
              </Button>
            </div>
          </Card>

          <Card className="bg-sidebar">
            <CardHeader
              title={ar.adminFields}
              description={ar.adminSectionHint}
              icon={<ClipboardList />}
              actions={
                <Button variant="ghost" size="icon-sm" onClick={() => setAdminOpen(true)} aria-label={ar.editAdminFields} title={ar.editAdminFields}>
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <dl className="space-y-3 px-4 py-4 text-sm sm:px-5">
              <div>
                <dt className="text-xs text-muted-foreground">{ar.adminNotes}</dt>
                <dd
                  className={cn(
                    "mt-0.5 whitespace-pre-wrap break-words leading-relaxed",
                    adminFields.adminNotes ? "text-foreground" : "text-muted-foreground/70",
                  )}
                >
                  {adminFields.adminNotes || ar.noAdminNotes}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{ar.adminAttachment}</dt>
                <dd className="mt-0.5">
                  {adminFields.attachmentFileId ? (
                    <a
                      className="inline-flex max-w-full items-center gap-1.5 font-medium text-primary hover:underline"
                      href={`/api/files/${adminFields.attachmentFileId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Paperclip className="size-3.5 shrink-0" />
                      <span className="truncate" dir="auto">
                        {adminFields.attachmentFilename || ar.viewAttachedFile}
                      </span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground/70">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button className="flex-1" onClick={() => setDialog("status")} disabled={!canChangeStatus}>
            <RefreshCw className="size-4" />
            {ar.changeStatus}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setChatOpen(true)}>
            <MessageCircle className="size-4" />
            {ar.conversation}
          </Button>
          {moreMenu}
        </div>
      </div>

      <OrderChatDialog orderId={orderId} open={chatOpen} onOpenChange={setChatOpen} />
      <AdminFieldsDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        orderId={orderId}
        orderNumber={String(order.orderNumber)}
        value={adminFields}
        onSaved={(next: OrderAdminFields) => {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  order: { ...(prev.order as Record<string, unknown>), adminFields: next },
                }
              : prev,
          );
        }}
      />

      <StatusChangeDialog
        open={dialog === "status"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("status"))}
        orderId={orderId}
        orderNumber={String(order.orderNumber)}
        currentStatus={order.status}
        onChanged={load}
      />

      <Dialog
        open={dialog === "message"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("message"))}
        title={ar.sendMessage}
        size="md"
        footer={
          <>
            <Button
              type="button"
              loading={busy === "message"}
              disabled={!message.trim() && !attachFile}
              onClick={sendMessage}
            >
              {ar.send}
            </Button>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="direct-message">{ar.typeMessage}</Label>
            <Textarea
              id="direct-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
          </div>
          <FilePicker file={attachFile} onChange={setAttachFile} />
        </div>
      </Dialog>

      <Dialog
        open={dialog === "attach"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("attach"))}
        title={ar.attachFile}
        size="sm"
        footer={
          <>
            <Button type="button" loading={busy === "upload"} disabled={!attachFile} onClick={uploadAttachment}>
              {ar.attachFile}
            </Button>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <FilePicker file={attachFile} onChange={setAttachFile} hint={false} accept="" />
      </Dialog>

      <Dialog
        open={dialog === "block"}
        onOpenChange={(open) => (!open ? closeDialog() : setDialog("block"))}
        title={ar.block}
        description={ar.blockReasonHint}
        size="sm"
        footer={
          <>
            <Button type="button" variant="danger" loading={busy === "block"} onClick={block}>
              {ar.block}
            </Button>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {ar.cancel}
            </Button>
          </>
        }
      >
        <div>
          <Label htmlFor="block-reason">
            {ar.reason} <span className="font-normal text-muted-foreground">({ar.optional})</span>
          </Label>
          <Input id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}

function FilePicker({
  file,
  onChange,
  hint = true,
  accept = FILE_ACCEPT,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  hint?: boolean;
  accept?: string;
}) {
  return (
    <div>
      {file ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-border">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
            {file.name}
          </span>
          <Button type="button" variant="danger-ghost" size="sm" onClick={() => onChange(null)}>
            {ar.delete}
          </Button>
        </div>
      ) : (
        <label className={buttonClass("outline", "md", "cursor-pointer border-dashed")}>
          <Upload className="size-4" />
          {ar.attachFile}
          <input
            type="file"
            accept={accept || undefined}
            className="sr-only"
            onChange={(e) => {
              onChange(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {hint && !file ? <FieldHint>{ar.statusChangeFileHint}</FieldHint> : null}
    </div>
  );
}
