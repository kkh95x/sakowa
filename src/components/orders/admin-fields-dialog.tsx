"use client";

import { useEffect, useState } from "react";
import { FileIcon, Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/i18n/ar";
import { useToast } from "@/components/ui/toast";
import { emptyAdminFields, parseAdminFields } from "@/lib/orders/admin-fields";
import type { OrderAdminFields } from "@/types";

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
  const [shamCashReceiptNumber, setShamCashReceiptNumber] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [invoiceFileId, setInvoiceFileId] = useState<string | null>(null);
  const [invoiceFilename, setInvoiceFilename] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [clearInvoice, setClearInvoice] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const parsed = parseAdminFields(value);
    setShamCashReceiptNumber(parsed.shamCashReceiptNumber);
    setAdminNotes(parsed.adminNotes);
    setInvoiceNumber(parsed.invoiceNumber);
    setPaymentDate(parsed.paymentDate);
    setInvoiceFileId(parsed.invoiceFileId);
    setInvoiceFilename(parsed.invoiceFilename);
    setInvoiceFile(null);
    setClearInvoice(false);
  }, [open, value]);

  async function save() {
    if (!orderId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("shamCashReceiptNumber", shamCashReceiptNumber);
      form.set("adminNotes", adminNotes);
      form.set("invoiceNumber", invoiceNumber);
      form.set("paymentDate", paymentDate);
      if (invoiceFile) form.set("invoiceFile", invoiceFile);
      if (clearInvoice && !invoiceFile) form.set("clearInvoice", "true");
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

  const existingInvoice = invoiceFileId && !clearInvoice ? invoiceFilename || ar.invoiceFile : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={ar.editAdminFields}
      description={orderNumber ? `${orderNumber} · ${ar.adminFieldsHint}` : ar.adminFieldsHint}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ar.cancel}
          </Button>
          <Button type="button" onClick={() => void save()} loading={busy} disabled={!orderId}>
            {ar.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="sham-cash">{ar.shamCashReceiptNumber}</Label>
          <Input
            id="sham-cash"
            value={shamCashReceiptNumber}
            onChange={(e) => setShamCashReceiptNumber(e.target.value)}
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="admin-notes">{ar.adminNotes}</Label>
          <textarea
            id="admin-notes"
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={4}
            maxLength={4000}
          />
        </div>
        <div>
          <Label htmlFor="invoice-number">{ar.invoiceNumber}</Label>
          <Input
            id="invoice-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="payment-date">{ar.paymentDate}</Label>
          <Input
            id="payment-date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div>
          <Label>{ar.invoiceFile}</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
              {ar.chooseInvoiceFile}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setInvoiceFile(file);
                  if (file) setClearInvoice(false);
                }}
              />
            </label>
            {invoiceFile ? <span className="text-sm">{invoiceFile.name}</span> : null}
            {!invoiceFile && existingInvoice && invoiceFileId ? (
              <a
                className="inline-flex items-center gap-1 text-sm text-primary underline"
                href={`/api/files/${invoiceFileId}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileIcon className="size-3.5" />
                {existingInvoice}
              </a>
            ) : null}
            {(invoiceFile || existingInvoice) && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => {
                  if (invoiceFile) {
                    setInvoiceFile(null);
                    return;
                  }
                  setClearInvoice(true);
                }}
              >
                <Trash2 className="size-3.5" />
                {ar.removeInvoiceFile}
              </button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function AdminFieldsButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={
        className ??
        "inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
      }
      onClick={onClick}
      title={ar.editAdminFields}
    >
      <Pencil className="size-3.5" />
      {ar.editAdminFields}
    </button>
  );
}
