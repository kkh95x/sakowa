import type { OrderAdminFields } from "@/types";

const TEXT_MAX = 120;
const NOTES_MAX = 4000;

function clip(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function parsePaymentDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const day = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day) {
    const parsed = new Date(`${day[1]}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? "" : day[1];
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function formatPaymentDate(value: unknown) {
  const ymd = parsePaymentDate(value);
  if (!ymd) return "";
  const parsed = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString("ar-SY", { dateStyle: "medium" });
}

export function emptyAdminFields(): OrderAdminFields {
  return {
    shamCashReceiptNumber: "",
    adminNotes: "",
    invoiceNumber: "",
    paymentDate: "",
    invoiceFileId: null,
    invoiceFilename: null,
  };
}

export function parseAdminFields(raw: unknown): OrderAdminFields {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const invoiceFileId = String(src.invoiceFileId ?? "").trim() || null;
  return {
    shamCashReceiptNumber: clip(src.shamCashReceiptNumber, TEXT_MAX),
    adminNotes: clip(src.adminNotes, NOTES_MAX),
    invoiceNumber: clip(src.invoiceNumber, TEXT_MAX),
    paymentDate: parsePaymentDate(src.paymentDate),
    invoiceFileId,
    invoiceFilename: invoiceFileId ? clip(src.invoiceFilename, 180) || null : null,
  };
}

export function hasAdminFields(fields: OrderAdminFields) {
  return Boolean(
    fields.shamCashReceiptNumber ||
      fields.adminNotes ||
      fields.invoiceNumber ||
      fields.paymentDate ||
      fields.invoiceFileId,
  );
}
