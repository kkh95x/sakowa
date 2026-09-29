import { ar } from "@/i18n/ar";
import type { VoiceTranscript } from "@/lib/telegram/normalize-input";
import type { RequestField } from "@/types";

export type FieldAnswer = {
  kind: "empty" | "text" | "file" | "image" | "audio" | "video" | "location" | "contact" | "other";
  text: string;
  gridFsId?: string;
  telegramFileId?: string;
  filename?: string;
  mimeType?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  transcript?: VoiceTranscript;
};

function readTranscript(value: unknown): VoiceTranscript | undefined {
  if (!value || typeof value !== "object") return undefined;
  const transcript = (value as { transcript?: { status?: string; text?: string | null } }).transcript;
  if (!transcript) return undefined;
  if (transcript.status !== "pending" && transcript.status !== "ready" && transcript.status !== "failed") return undefined;
  const text = typeof transcript.text === "string" ? transcript.text.trim() : "";
  return { status: transcript.status, text: text || null };
}

export function orderHasPendingTranscript(fields: Record<string, unknown> | undefined) {
  if (!fields) return false;
  return Object.values(fields).some((value) => readTranscript(value)?.status === "pending");
}

function isTelegramFileId(value: string) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
}

function isFileFieldType(type?: string) {
  return type === "FILE" || type === "IMAGE" || type === "DYNAMIC";
}

function mediaKindFromContent(contentType?: string, fieldType?: string): FieldAnswer["kind"] {
  switch (contentType) {
    case "photo":
    case "sticker":
    case "animation":
      return "image";
    case "voice":
    case "audio":
      return "audio";
    case "video":
    case "video_note":
      return "video";
    case "location":
      return "location";
    case "contact":
      return "contact";
    case "text":
      return "text";
    case "document":
      return "file";
    default:
      if (fieldType === "IMAGE") return "image";
      if (fieldType === "FILE") return "file";
      return contentType ? "other" : "file";
  }
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
      inputType?: string;
      contentType?: string;
      text?: string | null;
      telegramFileId?: string;
      fileId?: string;
      gridFsId?: string | null;
      storageId?: string | null;
      filename?: string | null;
      mimeType?: string | null;
      metadata?: Record<string, unknown>;
    };
    if (meta.inputType === "dynamic" || meta.contentType) {
      const kind = mediaKindFromContent(meta.contentType, fieldType);
      const telegramFileId = meta.fileId || meta.telegramFileId;
      const gridFsId = meta.storageId || meta.gridFsId;
      if (kind === "text") {
        return { kind: "text", text: meta.text?.trim() || "—", contentType: meta.contentType, metadata: meta.metadata };
      }
      if (kind === "location" || kind === "contact") {
        return {
          kind,
          text: meta.text?.trim() || (kind === "location" ? "📍 موقع" : "👤 جهة اتصال"),
          contentType: meta.contentType,
          metadata: meta.metadata,
        };
      }
      const label =
        meta.filename?.trim() ||
        meta.text?.trim() ||
        (kind === "image" ? "📷 صورة" : kind === "audio" ? "🎤 صوت" : kind === "video" ? "🎬 فيديو" : "📎 ملف");
      return {
        kind,
        text: label,
        gridFsId: gridFsId ? String(gridFsId) : undefined,
        telegramFileId: telegramFileId ? String(telegramFileId) : undefined,
        filename: meta.filename?.trim() || undefined,
        mimeType: meta.mimeType ?? undefined,
        contentType: meta.contentType,
        metadata: meta.metadata,
        transcript: kind === "audio" ? readTranscript(value) : undefined,
      };
    }
    if (meta.telegramFileId || meta.kind || meta.gridFsId || meta.fileId || meta.storageId) {
      if (fieldType && !isFileFieldType(fieldType) && !meta.telegramFileId && !meta.fileId) {
        return { kind: "text", text: meta.filename?.trim() || "—" };
      }
      const isImage = meta.kind === "photo" || fieldType === "IMAGE" || meta.contentType === "photo";
      const label = meta.filename?.trim() || (isImage ? "📷 صورة" : "📎 ملف");
      return {
        kind: isImage ? "image" : "file",
        text: label,
        gridFsId: meta.gridFsId || meta.storageId ? String(meta.gridFsId || meta.storageId) : undefined,
        telegramFileId: meta.telegramFileId || meta.fileId ? String(meta.telegramFileId || meta.fileId) : undefined,
        filename: meta.filename?.trim() || undefined,
        mimeType: meta.mimeType ?? undefined,
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

const CHOICE_FIELD_TYPES = new Set(["RADIO", "SELECT", "CHECKBOX"]);

/** Display-only: choice answers are stored as option values and shown as their labels. */
export function displayFieldAnswer(field: RequestField, value: unknown): FieldAnswer {
  const answer = parseFieldAnswer(value, field.type);
  if (answer.kind !== "text" || !CHOICE_FIELD_TYPES.has(field.type)) return answer;
  const text = displayChoice(field, value);
  return text ? { ...answer, text } : answer;
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
  if (answer.kind === "audio" && answer.transcript?.status === "ready" && answer.transcript.text) {
    return answer.transcript.text;
  }
  if (answer.kind === "file" || answer.kind === "image") return answer.text;
  return answer.text;
}

export function detectMediaType(
  answer: FieldAnswer,
  mimeType?: string | null,
): "image" | "pdf" | "audio" | "video" | "file" {
  const name = (answer.filename || answer.text || "").toLowerCase();
  const mime = mimeType || answer.mimeType || "";
  if (answer.kind === "audio" || mime.startsWith("audio/") || /\.(ogg|mp3|m4a|wav)$/i.test(name)) return "audio";
  if (answer.kind === "video" || mime.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(name)) return "video";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    answer.kind === "image" ||
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(name)
  ) {
    return "image";
  }
  return "file";
}
