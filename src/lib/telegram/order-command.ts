export const ORDER_STATUS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار",
  REVIEWING: "قيد المراجعة",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تم الحل",
  REJECTED: "مرفوضة",
  CLOSED: "مغلقة",
  COMPLETED: "تم الحل",
  ARCHIVED: "مغلقة",
};

export function orderStatusLabel(status: unknown) {
  const key = String(status ?? "");
  return ORDER_STATUS_AR[key] ?? key;
}

/**
 * Status update sent to the complaint owner. Only the rejection reason and the explicit
 * message to the user are user-facing; resolution/closing notes and admin notes stay internal.
 */
export function statusUpdateTelegramText(params: {
  orderNumber: unknown;
  status: unknown;
  message?: string | null;
  reason?: string | null;
}) {
  const message = params.message?.trim();
  const reason = params.reason?.trim();
  return [
    "تحديث على شكواك",
    `#${params.orderNumber}`,
    `الحالة: ${orderStatusLabel(params.status)}`,
    reason ? `\nسبب الرفض:\n${reason}` : "",
    message ? `\n${message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Telegram slash command for an order, e.g. ORD-00012 → o_00012 */
export function orderSlashCommand(orderNumber: unknown) {
  const digits = String(orderNumber ?? "").replace(/\D/g, "");
  return digits ? `o_${digits}` : "";
}

/** Numeric part of /o_00012 or /o_00012@BotName */
export function orderDigitsFromCommand(command: string) {
  const token = command.trim().split(/\s+/)[0]?.split("@")[0] ?? "";
  const name = token.replace(/^\/+/, "").toLowerCase();
  if (!name.startsWith("o_")) return null;
  const digits = name.slice(2).replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function orderNumberLookup(digits: number) {
  return { $regex: `^(ORD|SHK)-0*${digits}$` };
}

export function formatOrderCommandLine(orderNumber: unknown, status: unknown, name?: unknown) {
  const num = String(orderNumber ?? "").trim();
  const statusLabel = orderStatusLabel(status);
  const service = String(name ?? "").trim();
  const parts = [num ? `\u2066${num}\u2069` : "", service, statusLabel].filter(Boolean);
  const text = parts.join(" - ");
  if (text.length <= 64) return text;
  return `${text.slice(0, 63)}…`;
}

export const MY_ORDERS_PAGE_SIZE = 5;

export function clampMyOrdersPage(page: number, total: number, pageSize = MY_ORDERS_PAGE_SIZE) {
  const last = Math.max(0, Math.ceil(Math.max(0, total) / pageSize) - 1);
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(Math.trunc(page), last);
}

export function myOrdersNavButtons(page: number, total: number, pageSize = MY_ORDERS_PAGE_SIZE) {
  const last = Math.max(0, Math.ceil(Math.max(0, total) / pageSize) - 1);
  const row: { text: string; callback_data: string }[] = [];
  if (page > 0) row.push({ text: "السابق", callback_data: `ords:${page - 1}` });
  if (page < last) row.push({ text: "التالي", callback_data: `ords:${page + 1}` });
  return row;
}
