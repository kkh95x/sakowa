import { ar } from "@/i18n/ar";
import type { RequestField } from "@/types";

export type FieldAnswer = {
  kind: "empty" | "text" | "file" | "image";
  text: string;
  gridFsId?: string;
  telegramFileId?: string;
  filename?: string;
};

function isTelegramFileId(value: string) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
}

function isFileFieldType(type?: string) {
  return type === "FILE" || type === "IMAGE";
}

export function parseFieldAnswer(value: unknown, fieldType?: string): FieldAnswer {
  if (value === undefined || value === null || value === "") {
    return { kind: "empty", text: "—" };
  }

  if (typeof value === "boolean") {
    return { kind: "text", text: value ? ar.operators.yes : ar.operators.no };
  }

  if (typeof value === "object") {
    const meta = value as {
      kind?: string;
      telegramFileId?: string;
      gridFsId?: string | null;
      filename?: string | null;
    };
    if (meta.telegramFileId || meta.kind || meta.gridFsId) {
      if (fieldType && !isFileFieldType(fieldType)) {
        return { kind: "text", text: meta.filename?.trim() || "—" };
      }
      const isImage = meta.kind === "photo" || fieldType === "IMAGE";
      const label = meta.filename?.trim() || (isImage ? "📷 صورة" : "📎 ملف");
      return {
        kind: isImage ? "image" : "file",
        text: label,
        gridFsId: meta.gridFsId ? String(meta.gridFsId) : undefined,
        telegramFileId: meta.telegramFileId ? String(meta.telegramFileId) : undefined,
        filename: meta.filename?.trim() || undefined,
      };
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { kind: "empty", text: "—" };
    if (isFileFieldType(fieldType) || isTelegramFileId(trimmed)) {
      const isImage = fieldType === "IMAGE";
      return {
        kind: isImage ? "image" : "file",
        text: isImage ? "📷 صورة" : "📎 ملف",
        telegramFileId: trimmed,
      };
    }
  }

  return { kind: "text", text: String(value) };
}

export function optionLabel(field: Pick<RequestField, "options">, value: unknown): string {
  const raw = String(value ?? "");
  const opt = field.options?.find((o) => o.value === raw || o.label === raw);
  return opt?.label ?? raw;
}

export function displayChoice(field: RequestField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (field.type === "CONFIRMATION") {
    if (value === true || value === "true") return ar.operators.yes;
    if (value === false || value === "false") return ar.operators.no;
  }
  if (Array.isArray(value)) {
    return value.map((item) => optionLabel(field, item)).filter(Boolean).join("، ");
  }
  if (field.options?.length) return optionLabel(field, value);
  const parsed = parseFieldAnswer(value, field.type);
  return parsed.kind === "empty" ? "" : parsed.text;
}

export function fieldAnswerFileUrl(orderId: string, fieldName: string, answer: FieldAnswer) {
  return fieldAnswerFileUrls(orderId, fieldName, answer)[0] ?? null;
}

export function fieldAnswerFileUrls(orderId: string, fieldName: string, answer: FieldAnswer) {
  const urls: string[] = [];
  if (answer.gridFsId) urls.push(`/api/files/${answer.gridFsId}`);
  if (answer.telegramFileId) {
    urls.push(`/api/orders/${orderId}/field-file?field=${encodeURIComponent(fieldName)}`);
  }
  return urls;
}

export function fieldAnswerLabel(answer: FieldAnswer) {
  if (answer.kind === "file" || answer.kind === "image") return answer.text;
  return answer.text;
}

export function detectMediaType(answer: FieldAnswer, mimeType?: string | null): "image" | "pdf" | "file" {
  const name = (answer.filename || answer.text || "").toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    answer.kind === "image" ||
    mimeType?.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(name)
  ) {
    return "image";
  }
  return "file";
}
