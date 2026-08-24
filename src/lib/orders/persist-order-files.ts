import { ObjectId } from "mongodb";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { resolveUploadMime } from "@/lib/storage/mime";
import { TelegramService } from "@/lib/telegram/telegram-service";
import type { FilePurpose, RequestField } from "@/types";

export type StoredFileField = {
  telegramFileId: string;
  kind: "photo" | "document";
  gridFsId: string;
  filename: string | null;
};

function filePurpose(field: RequestField, kind: "photo" | "document"): FilePurpose {
  if (field.type === "IMAGE" || kind === "photo") return "REQUEST_IMAGE";
  return "ORDER_ATTACHMENT";
}

function normalizeFileField(
  raw: unknown,
  field: RequestField,
): { meta: Omit<StoredFileField, "gridFsId"> & { gridFsId?: string | null }; needsDownload: boolean } | null {
  if (raw === undefined || raw === null || raw === "") return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const kind: "photo" | "document" = field.type === "IMAGE" ? "photo" : "document";
    return {
      meta: {
        telegramFileId: trimmed,
        kind,
        gridFsId: null,
        filename: kind === "photo" ? "photo.jpg" : null,
      },
      needsDownload: true,
    };
  }

  if (typeof raw !== "object") return null;
  const value = raw as {
    telegramFileId?: string;
    kind?: "photo" | "document";
    gridFsId?: string | null;
    filename?: string | null;
  };
  const telegramFileId = value.telegramFileId?.trim();
  if (!telegramFileId && !value.gridFsId) return null;

  const kind: "photo" | "document" =
    value.kind || (field.type === "IMAGE" ? "photo" : "document");

  const gridFsId = value.gridFsId ? String(value.gridFsId) : null;
  const hasValidGridFs = gridFsId && ObjectId.isValid(gridFsId);

  return {
    meta: {
      telegramFileId: telegramFileId || "",
      kind,
      gridFsId: hasValidGridFs ? gridFsId : null,
      filename: value.filename ?? null,
    },
    needsDownload: !hasValidGridFs,
  };
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
    if (field.type !== "FILE" && field.type !== "IMAGE") continue;

    const normalized = normalizeFileField(fields[field.name], field);
    if (!normalized) continue;

    const { meta, needsDownload } = normalized;
    if (!needsDownload && meta.gridFsId) {
      attachments.add(meta.gridFsId);
      fields[field.name] = {
        telegramFileId: meta.telegramFileId,
        kind: meta.kind,
        gridFsId: meta.gridFsId,
        filename: meta.filename,
      };
      continue;
    }

    if (!meta.telegramFileId) {
      throw new Error(`FILE_NOT_STORED:${field.name}`);
    }

    const downloaded = await TelegramService.downloadFile(params.botId, meta.telegramFileId);
    const filename =
      meta.filename?.trim() ||
      downloaded.filename ||
      (meta.kind === "photo" ? "photo.jpg" : "attachment.bin");
    const mimeType = resolveUploadMime(filename, downloaded.mimeType);
    const gridFsId = await GridFSStorageService.save({
      buffer: downloaded.buffer,
      filename,
      mimeType,
      ownerType: "order",
      ownerId: params.orderId,
      uploadedBy: String(params.telegramUserId),
      purpose: filePurpose(field, meta.kind),
    });

    fields[field.name] = {
      telegramFileId: meta.telegramFileId,
      kind: meta.kind,
      gridFsId,
      filename,
    };
    attachments.add(gridFsId);
  }

  return { fields, attachments: [...attachments] };
}

export async function persistTelegramUpload(params: {
  botId: string;
  telegramUserId: number;
  field: RequestField;
  telegramFileId: string;
  kind: "photo" | "document";
  filename?: string | null;
  mimeType?: string | null;
  ownerId?: string;
}): Promise<StoredFileField> {
  const downloaded = await TelegramService.downloadFile(params.botId, params.telegramFileId);
  const filename =
    params.filename?.trim() ||
    downloaded.filename ||
    (params.kind === "photo" ? "photo.jpg" : "attachment.bin");
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
