import type { OrderStatus } from "@/types";

export const COMPLAINT_STATUSES = [
  "PENDING",
  "REVIEWING",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

const LEGACY: Record<string, ComplaintStatus> = {
  COMPLETED: "RESOLVED",
  ARCHIVED: "CLOSED",
};

export const STATUS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار",
  REVIEWING: "قيد المراجعة",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تم الحل",
  REJECTED: "مرفوضة",
  CLOSED: "مغلقة",
  COMPLETED: "تم الحل",
  ARCHIVED: "مغلقة",
};

export const TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  PENDING: ["REVIEWING", "REJECTED", "RESOLVED", "CLOSED"],
  REVIEWING: ["IN_PROGRESS", "REJECTED", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  REJECTED: ["RESOLVED", "CLOSED"],
  CLOSED: ["RESOLVED"],
};

export const REJECTION_REASON_MIN = 3;
export const REJECTION_REASON_MAX = 1000;
export const STATUS_NOTE_MAX = 2000;

export type StatusChangeErrorCode =
  | "INVALID_STATUS"
  | "STATUS_UNCHANGED"
  | "INVALID_TRANSITION"
  | "REJECTION_REASON_REQUIRED"
  | "REJECTION_REASON_TOO_SHORT"
  | "REJECTION_REASON_TOO_LONG"
  | "STATUS_NOTE_TOO_LONG"
  | "STATUS_CONFLICT";

export const STATUS_ERROR_AR: Record<StatusChangeErrorCode, string> = {
  INVALID_STATUS: "الحالة المطلوبة غير صالحة.",
  STATUS_UNCHANGED: "الشكوى في هذه الحالة بالفعل.",
  INVALID_TRANSITION: "لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية.",
  REJECTION_REASON_REQUIRED: "سبب الرفض مطلوب.",
  REJECTION_REASON_TOO_SHORT: `سبب الرفض قصير جداً (${REJECTION_REASON_MIN} أحرف على الأقل).`,
  REJECTION_REASON_TOO_LONG: `سبب الرفض طويل جداً (${REJECTION_REASON_MAX} حرف كحد أقصى).`,
  STATUS_NOTE_TOO_LONG: `الملاحظات طويلة جداً (${STATUS_NOTE_MAX} حرف كحد أقصى).`,
  STATUS_CONFLICT: "تغيّرت حالة الشكوى للتو من مستخدم آخر. أعد تحميل الصفحة وحاول مجدداً.",
};

export function isStatusChangeErrorCode(code: unknown): code is StatusChangeErrorCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(STATUS_ERROR_AR, code);
}

/** Status-specific context kept in the status history; each belongs to exactly one target status. */
export interface StatusChangeContext {
  reason?: string;
  resolutionNote?: string;
  closingNote?: string;
}

function cleanNote(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validates a requested transition and keeps only the context field that belongs to
 * the target status, so a browser cannot attach e.g. a rejection reason to RESOLVED.
 */
export function validateStatusChange(input: {
  from: unknown;
  to: unknown;
  reason?: unknown;
  resolutionNote?: unknown;
  closingNote?: unknown;
}):
  | { ok: true; from: ComplaintStatus; to: ComplaintStatus; context: StatusChangeContext }
  | { ok: false; code: StatusChangeErrorCode } {
  const raw = String(input.to ?? "");
  if (!(raw in LEGACY) && !(COMPLAINT_STATUSES as readonly string[]).includes(raw)) {
    return { ok: false, code: "INVALID_STATUS" };
  }
  const from = canonicalizeStatus(input.from);
  const to = canonicalizeStatus(raw);
  if (from === to) return { ok: false, code: "STATUS_UNCHANGED" };
  if (!canTransition(from, to)) return { ok: false, code: "INVALID_TRANSITION" };

  const context: StatusChangeContext = {};
  if (to === "REJECTED") {
    const reason = cleanNote(input.reason);
    if (!reason) return { ok: false, code: "REJECTION_REASON_REQUIRED" };
    if (reason.length < REJECTION_REASON_MIN) return { ok: false, code: "REJECTION_REASON_TOO_SHORT" };
    if (reason.length > REJECTION_REASON_MAX) return { ok: false, code: "REJECTION_REASON_TOO_LONG" };
    context.reason = reason;
  } else if (to === "RESOLVED") {
    const note = cleanNote(input.resolutionNote);
    if (note.length > STATUS_NOTE_MAX) return { ok: false, code: "STATUS_NOTE_TOO_LONG" };
    if (note) context.resolutionNote = note;
  } else if (to === "CLOSED") {
    const note = cleanNote(input.closingNote);
    if (note.length > STATUS_NOTE_MAX) return { ok: false, code: "STATUS_NOTE_TOO_LONG" };
    if (note) context.closingNote = note;
  }
  return { ok: true, from, to, context };
}

function clip(text: string, max = 160) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Body of the in-app admin notification for a status change. */
export function statusChangeNotificationMessage(params: {
  orderNumber: unknown;
  from: unknown;
  to: unknown;
  context?: StatusChangeContext;
}) {
  const lines = [
    `#${String(params.orderNumber ?? "")}`,
    `${complaintStatusLabel(canonicalizeStatus(params.from))} ← ${complaintStatusLabel(canonicalizeStatus(params.to))}`,
  ];
  if (params.context?.reason) lines.push(`سبب الرفض: ${clip(params.context.reason)}`);
  if (params.context?.resolutionNote) lines.push(`ملاحظات الحل: ${clip(params.context.resolutionNote)}`);
  return lines.join("\n");
}

export function canonicalizeStatus(status: unknown): ComplaintStatus {
  const raw = String(status ?? "");
  if (raw in LEGACY) return LEGACY[raw];
  if ((COMPLAINT_STATUSES as readonly string[]).includes(raw)) return raw as ComplaintStatus;
  return "PENDING";
}

export function isClosedStatus(status: unknown) {
  const canonical = canonicalizeStatus(status);
  return canonical === "CLOSED" || String(status) === "ARCHIVED";
}

export function statusMatchValues(status: unknown): string[] {
  const canonical = canonicalizeStatus(status);
  if (canonical === "RESOLVED") return ["RESOLVED", "COMPLETED"];
  if (canonical === "CLOSED") return ["CLOSED", "ARCHIVED"];
  return [canonical];
}

export function statusMongoQuery(status: unknown) {
  const values = statusMatchValues(status);
  return values.length === 1 ? values[0] : { $in: values };
}

export function closedStatusMongoQuery() {
  return { $in: ["CLOSED", "ARCHIVED"] };
}

export function notClosedStatusMongoQuery() {
  return { $nin: ["CLOSED", "ARCHIVED"] };
}

export function canTransition(from: unknown, to: unknown) {
  const source = canonicalizeStatus(from);
  const target = canonicalizeStatus(to);
  return TRANSITIONS[source]?.includes(target) ?? false;
}

export function complaintStatusLabel(status: unknown) {
  const key = String(status ?? "");
  return STATUS_AR[key] ?? key;
}

export function emptyStatusCounts(): Record<ComplaintStatus, number> {
  return {
    PENDING: 0,
    REVIEWING: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    REJECTED: 0,
    CLOSED: 0,
  };
}

export function accumulateStatusCount(
  map: Record<string, number>,
  status: unknown,
  count: number,
) {
  const key = canonicalizeStatus(status);
  map[key] = (map[key] ?? 0) + count;
}

export const COMPLAINT_NUMBER_PREFIX = "SHK";

export function formatComplaintNumber(seq: number) {
  return `${COMPLAINT_NUMBER_PREFIX}-${String(Math.max(1, seq)).padStart(5, "0")}`;
}

export function parseComplaintSeq(orderNumber: unknown) {
  const n = Number(String(orderNumber ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}
