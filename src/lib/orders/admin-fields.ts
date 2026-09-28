import type { OrderAdminFields } from "@/types";

const NOTES_MAX = 4000;
const FILENAME_MAX = 180;

function clip(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function emptyAdminFields(): OrderAdminFields {
  return {
    adminNotes: "",
    attachmentFileId: null,
    attachmentFilename: null,
  };
}

/**
 * Complaint admin fields. Historical documents may also hold legacy payment keys
 * (shamCashReceiptNumber, invoiceNumber, paymentDate, invoiceFileId, invoiceFilename);
 * they are intentionally not parsed so they are neither exposed nor rewritten.
 */
export function parseAdminFields(raw: unknown): OrderAdminFields {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const attachmentFileId = String(src.attachmentFileId ?? "").trim() || null;
  return {
    adminNotes: clip(src.adminNotes, NOTES_MAX),
    attachmentFileId,
    attachmentFilename: attachmentFileId ? clip(src.attachmentFilename, FILENAME_MAX) || null : null,
  };
}

export function hasAdminFields(fields: OrderAdminFields) {
  return Boolean(fields.adminNotes || fields.attachmentFileId);
}

/** Mongo `$set` that touches only the complaint admin keys and leaves any legacy keys in place. */
export function adminFieldsSet(current: unknown, next: OrderAdminFields): Record<string, unknown> {
  if (!current || typeof current !== "object" || Array.isArray(current)) return { adminFields: next };
  return {
    "adminFields.adminNotes": next.adminNotes,
    "adminFields.attachmentFileId": next.attachmentFileId,
    "adminFields.attachmentFilename": next.attachmentFilename,
  };
}
