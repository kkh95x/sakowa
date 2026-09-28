import { GridFSStorageService } from "@/lib/storage/gridfs";
import {
  isStorageId,
  validatePromptBlocks,
  verifyPromptFiles,
  type PromptStoredFile,
} from "@/lib/telegram/field-prompt";
import type { TelegramPromptBlock } from "@/types";

export type PromptFileLookup = (storageId: string) => Promise<PromptStoredFile | null>;

/** Authoritative file metadata; never trust what the browser reported. */
export async function lookupPromptFile(storageId: string): Promise<PromptStoredFile | null> {
  if (!isStorageId(storageId)) return null;
  const file = await GridFSStorageService.get(storageId);
  if (!file) return null;
  const meta = (file.metadata ?? {}) as { mimeType?: string; size?: number; originalName?: string; ownerType?: string };
  return {
    mimeType: String(meta.mimeType ?? ""),
    size: Number(meta.size ?? file.length ?? 0),
    fileName: String(meta.originalName ?? file.filename ?? "file.bin"),
    ownerType: meta.ownerType,
  };
}

/**
 * Shared server-side gate for every Telegram message composition (field questions,
 * bot welcome message). Throws `INVALID_TELEGRAM_MESSAGE:<label>: <reason>` and returns
 * blocks whose media metadata comes from storage.
 */
export async function normalizePromptBlocks(
  blocks: TelegramPromptBlock[],
  label: string,
  lookup: PromptFileLookup = lookupPromptFile,
): Promise<TelegramPromptBlock[]> {
  const shapeErrors = validatePromptBlocks(blocks);
  if (shapeErrors.length) throw new Error(`INVALID_TELEGRAM_MESSAGE:${label}: ${shapeErrors[0].message}`);
  const verified = await verifyPromptFiles(blocks, lookup);
  if (verified.errors.length) throw new Error(`INVALID_TELEGRAM_MESSAGE:${label}: ${verified.errors[0].message}`);
  return verified.blocks;
}
