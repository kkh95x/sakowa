import { ObjectId } from "mongodb";
import { logJson } from "@/lib/log";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { resolveUploadMime } from "@/lib/storage/mime";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { isDynamicAnswer, type TelegramFileKind } from "@/lib/telegram/normalize-input";
import type { FilePurpose, RequestField } from "@/types";

export type StoredFileField = {
  telegramFileId: string;
  kind: TelegramFileKind | "photo" | "document";
  gridFsId: string;
  filename: string | null;
};

function filePurpose(field: RequestField, kind: string): FilePurpose {
  if (field.type === "IMAGE" || kind === "photo") return "REQUEST_IMAGE";
  return "ORDER_ATTACHMENT";
}

function defaultFilename(kind: string) {
  switch (kind) {
    case "photo":
      return "photo.jpg";
    case "voice":
      return "voice.ogg";
    case "audio":
      return "audio.mp3";
    case "video":
    case "video_note":
      return "video.mp4";
    case "animation":
      return "animation.mp4";
    case "sticker":
      return "sticker.webp";
    default:
      return "attachment.bin";
  }
}

const TELEGRAM_FILE_ID_RE = /^[A-Za-z0-9_-]{20,}$/;

function telegramFileIdOf(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return TELEGRAM_FILE_ID_RE.test(trimmed) ? trimmed : "";
  }
  const value = raw as { telegramFileId?: string; fileId?: string };
  return String(value.telegramFileId || value.fileId || "").trim();
}

function gridFsIdOf(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { gridFsId?: string | null; storageId?: string | null };
  const id = value.gridFsId || value.storageId;
  return id && ObjectId.isValid(String(id)) ? String(id) : null;
}

export function isPersistableFileField(field: RequestField, raw: unknown) {
  if (field.type === "FILE" || field.type === "IMAGE" || field.type === "DYNAMIC") return true;
  if (!raw || typeof raw !== "object") return false;
  return Boolean(telegramFileIdOf(raw) || gridFsIdOf(raw));
}

export async function persistOrderFieldFiles(params: {
  botId: string;
  orderId: string;
  telegramUserId: number;
  fields: Record<string, unknown>;
  fieldDefs: RequestField[];
}): Promise<{ fields: Record<string, unknown>; attachments: string[] }> {
  const fields = { ...params.fields };
  const attachments = new Set<string>();

  for (const field of params.fieldDefs) {
    const raw = fields[field.name] ?? fields[field.id];
    if (!isPersistableFileField(field, raw)) continue;
    const telegramFileId = telegramFileIdOf(raw);
    const existingGrid = gridFsIdOf(raw);
    if (existingGrid) {
      attachments.add(existingGrid);
      if (isDynamicAnswer(raw)) {
        fields[field.name] = { ...raw, storageId: existingGrid };
      }
      continue;
    }
    if (!telegramFileId) continue;

    const kind =
      (raw && typeof raw === "object"
        ? String((raw as { kind?: string; contentType?: string }).kind || (raw as { contentType?: string }).contentType || "")
        : "") || (field.type === "IMAGE" ? "photo" : "document");
    const filename =
      (raw && typeof raw === "object" ? String((raw as { filename?: string }).filename ?? "") : "") ||
      defaultFilename(kind);

    try {
      const downloaded = await TelegramService.downloadFile(params.botId, telegramFileId);
      const savedName = filename.trim() || downloaded.filename || defaultFilename(kind);
      const mimeType = resolveUploadMime(
        savedName,
        (raw && typeof raw === "object" ? String((raw as { mimeType?: string }).mimeType ?? "") : "") ||
          downloaded.mimeType,
      );
      const gridFsId = await GridFSStorageService.save({
        buffer: downloaded.buffer,
        filename: savedName,
        mimeType,
        ownerType: "order",
        ownerId: params.orderId,
        uploadedBy: String(params.telegramUserId),
        purpose: filePurpose(field, kind),
      });
      if (field.type === "DYNAMIC" || isDynamicAnswer(raw)) {
        const base = isDynamicAnswer(raw) ? raw : { inputType: "dynamic" as const, contentType: kind, text: null, metadata: {} };
        fields[field.name] = {
          ...base,
          fileId: telegramFileId,
          storageId: gridFsId,
          filename: savedName,
          mimeType,
        };
      } else {
        fields[field.name] = {
          telegramFileId,
          kind: kind === "photo" ? "photo" : "document",
          gridFsId,
          filename: savedName,
        };
      }
      attachments.add(gridFsId);
    } catch (err) {
      logJson("error", "orders", "FIELD_FILE_PERSIST_FAILED", {
        orderId: params.orderId,
        botId: params.botId,
        field: field.name,
        error: err instanceof Error ? err.message : String(err),
      });
      if (field.type === "DYNAMIC" || isDynamicAnswer(raw)) {
        const base = isDynamicAnswer(raw) ? raw : { inputType: "dynamic" as const, contentType: kind, text: null, metadata: {} };
        fields[field.name] = { ...base, fileId: telegramFileId, storageId: null, filename };
      } else {
        fields[field.name] = {
          telegramFileId,
          kind: kind === "photo" ? "photo" : "document",
          gridFsId: null,
          filename,
        };
      }
    }
  }

  return { fields, attachments: [...attachments] };
}

export async function persistTelegramUpload(params: {
  botId: string;
  telegramUserId: number;
  field: RequestField;
  telegramFileId: string;
  kind: TelegramFileKind | "photo" | "document";
  filename?: string | null;
  mimeType?: string | null;
  ownerId?: string;
}): Promise<StoredFileField> {
  const downloaded = await TelegramService.downloadFile(params.botId, params.telegramFileId);
  const filename =
    params.filename?.trim() ||
    downloaded.filename ||
    defaultFilename(params.kind);
  const mimeType = resolveUploadMime(filename, params.mimeType ?? downloaded.mimeType);
  const gridFsId = await GridFSStorageService.save({
    buffer: downloaded.buffer,
    filename,
    mimeType,
    ownerType: "order",
    ownerId: params.ownerId ?? "draft",
    uploadedBy: String(params.telegramUserId),
    purpose: filePurpose(params.field, params.kind),
  });

  return {
    telegramFileId: params.telegramFileId,
    kind: params.kind,
    gridFsId,
    filename,
  };
}
