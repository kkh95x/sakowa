import type {
  RequestField,
  TelegramPrompt,
  TelegramPromptBlock,
  TelegramPromptBlockType,
} from "@/types";

export const PROMPT_BLOCK_TYPES: readonly TelegramPromptBlockType[] = ["text", "image", "document"];
export const PROMPT_MAX_BLOCKS = 10;
export const PROMPT_TEXT_MAX = 4096;
export const PROMPT_IMAGE_MIMES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
export const PROMPT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PROMPT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const PROMPT_FILE_OWNER_TYPE = "request_field";

export type PromptValidationError = {
  code: string;
  message: string;
  blockId?: string;
};

type PromptField = Pick<
  RequestField,
  "label" | "telegramMessage" | "telegramPrompt" | "imageFileId" | "attachmentFileId"
>;

export function isStorageId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}

function newBlockId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createPromptBlock(type: TelegramPromptBlockType): TelegramPromptBlock {
  const id = newBlockId();
  if (type === "text") return { id, type, text: "" };
  return { id, type, storageId: "" };
}

/** Pre-composer shape: `telegramMessage` string + a single `imageFileId`/`attachmentFileId`. */
export function legacyPromptBlocks(
  field: Pick<RequestField, "telegramMessage" | "imageFileId" | "attachmentFileId">,
): TelegramPromptBlock[] {
  const blocks: TelegramPromptBlock[] = [];
  const text = field.telegramMessage?.trim();
  if (text) blocks.push({ id: "legacy_text", type: "text", text });
  if (field.imageFileId) {
    blocks.push({ id: "legacy_image", type: "image", storageId: String(field.imageFileId) });
  } else if (field.attachmentFileId) {
    blocks.push({ id: "legacy_document", type: "document", storageId: String(field.attachmentFileId) });
  }
  return blocks;
}

/** Blocks shown in the composer: the saved composition, or the legacy content converted. */
export function editorPromptBlocks(field: PromptField): TelegramPromptBlock[] {
  if (field.telegramPrompt) return field.telegramPrompt.blocks ?? [];
  return legacyPromptBlocks(field);
}

/** Blocks the bot sends. Falls back to the field label when nothing is configured. */
export function resolveFieldPromptBlocks(field: PromptField): TelegramPromptBlock[] {
  const blocks = editorPromptBlocks(field);
  if (blocks.length) return blocks;
  const label = field.label?.trim();
  return label ? [{ id: "fallback_label", type: "text", text: label }] : [];
}

export function promptTextOf(blocks: TelegramPromptBlock[]): string {
  return blocks
    .filter((b): b is Extract<TelegramPromptBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Plain-text question used by review screens, chat reconstruction and list cards. */
export function fieldPromptText(field: PromptField): string {
  return promptTextOf(resolveFieldPromptBlocks(field)) || field.label || "";
}

/**
 * Stores the composition and mirrors it into the legacy properties so older
 * readers (order question text, chat reconstruction) keep working.
 */
export function applyPromptBlocks<T extends PromptField>(field: T, blocks: TelegramPromptBlock[]): T {
  const firstImage = blocks.find((b) => b.type === "image");
  const firstDocument = blocks.find((b) => b.type === "document");
  const next: T = {
    ...field,
    telegramPrompt: { blocks } satisfies TelegramPrompt,
    telegramMessage: promptTextOf(blocks),
  };
  if (firstImage && firstImage.type === "image" && firstImage.storageId) next.imageFileId = firstImage.storageId;
  else delete next.imageFileId;
  if (firstDocument && firstDocument.type === "document" && firstDocument.storageId) {
    next.attachmentFileId = firstDocument.storageId;
  } else delete next.attachmentFileId;
  return next;
}

/** Instruction the bot appends to the question, based on the expected answer type. */
export function fieldAnswerHint(type: RequestField["type"]): string | undefined {
  if (type === "FILE") return "📎 أرسل ملفاً.";
  if (type === "IMAGE") return "📷 أرسل صورة.";
  if (type === "DYNAMIC") return "يمكنك إرسال نص أو صورة أو صوت أو فيديو أو ملف أو موقع أو جهة اتصال.";
  return undefined;
}

/** Appends a system hint (e.g. "أرسل صورة") to the last text block, or adds one. */
export function withPromptHint(blocks: TelegramPromptBlock[], hint?: string): TelegramPromptBlock[] {
  if (!hint) return blocks;
  let lastText = -1;
  blocks.forEach((b, i) => {
    if (b.type === "text" && b.text.trim()) lastText = i;
  });
  if (lastText < 0) return [...blocks, { id: "hint", type: "text", text: hint }];
  return blocks.map((b, i) =>
    i === lastText && b.type === "text" ? { ...b, text: `${b.text.trim()}\n\n${hint}` } : b,
  );
}

export function movePromptBlock(blocks: TelegramPromptBlock[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= blocks.length || target >= blocks.length) return blocks;
  const next = [...blocks];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function updatePromptBlock(
  blocks: TelegramPromptBlock[],
  id: string,
  patch: Partial<Omit<TelegramPromptBlock, "id" | "type">>,
): TelegramPromptBlock[] {
  return blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as TelegramPromptBlock) : b));
}

export function removePromptBlock(blocks: TelegramPromptBlock[], id: string) {
  return blocks.filter((b) => b.id !== id);
}

/** Structural validation shared by the editor and the server. File existence is checked server-side. */
export function validatePromptBlocks(blocks: unknown): PromptValidationError[] {
  if (!Array.isArray(blocks)) return [{ code: "INVALID_PROMPT", message: "محتوى رسالة Telegram غير صالح." }];
  const errors: PromptValidationError[] = [];
  if (blocks.length > PROMPT_MAX_BLOCKS) {
    errors.push({ code: "TOO_MANY_BLOCKS", message: `الحد الأقصى ${PROMPT_MAX_BLOCKS} عناصر في رسالة Telegram.` });
  }
  const ids = new Set<string>();
  for (const raw of blocks) {
    const block = raw as Partial<TelegramPromptBlock> & Record<string, unknown>;
    const blockId = typeof block?.id === "string" ? block.id : undefined;
    if (!block || typeof block !== "object" || !blockId) {
      errors.push({ code: "INVALID_BLOCK", message: "عنصر غير صالح في رسالة Telegram." });
      continue;
    }
    if (ids.has(blockId)) {
      errors.push({ code: "DUPLICATE_BLOCK", message: "معرّف عنصر مكرر في رسالة Telegram.", blockId });
    }
    ids.add(blockId);
    if (!PROMPT_BLOCK_TYPES.includes(block.type as TelegramPromptBlockType)) {
      errors.push({ code: "UNSUPPORTED_BLOCK", message: "نوع محتوى Telegram غير مدعوم.", blockId });
      continue;
    }
    if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text.trim() : "";
      if (!text) errors.push({ code: "EMPTY_TEXT", message: "لا يمكن حفظ نص فارغ في رسالة Telegram.", blockId });
      else if (text.length > PROMPT_TEXT_MAX) {
        errors.push({ code: "TEXT_TOO_LONG", message: `النص يتجاوز ${PROMPT_TEXT_MAX} حرفاً.`, blockId });
      }
      continue;
    }
    const storageId = block.storageId;
    if (!storageId) {
      errors.push({
        code: block.type === "image" ? "MISSING_IMAGE" : "MISSING_DOCUMENT",
        message: block.type === "image" ? "عنصر الصورة بدون صورة مرفوعة." : "عنصر الملف بدون ملف مرفوع.",
        blockId,
      });
    } else if (!isStorageId(storageId)) {
      errors.push({ code: "INVALID_STORAGE_ID", message: "مرجع ملف غير صالح.", blockId });
    }
    if (block.type === "image" && typeof block.mimeType === "string" && block.mimeType && !PROMPT_IMAGE_MIMES.includes(block.mimeType)) {
      errors.push({ code: "INVALID_IMAGE_MIME", message: "الصورة يجب أن تكون JPG أو PNG أو WEBP.", blockId });
    }
  }
  return errors;
}

export type PromptStoredFile = {
  mimeType: string;
  size: number;
  fileName: string;
  ownerType?: string;
};

/**
 * Verifies every media block against storage metadata and returns blocks whose
 * fileName/mimeType/size come from storage (never from the client).
 */
export async function verifyPromptFiles(
  blocks: TelegramPromptBlock[],
  lookup: (storageId: string) => Promise<PromptStoredFile | null>,
): Promise<{ blocks: TelegramPromptBlock[]; errors: PromptValidationError[] }> {
  const errors: PromptValidationError[] = [];
  const out: TelegramPromptBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      out.push({ id: block.id, type: "text", text: block.text.trim() });
      continue;
    }
    const file = isStorageId(block.storageId) ? await lookup(block.storageId) : null;
    if (!file) {
      errors.push({ code: "FILE_NOT_FOUND", message: "الملف المرفق غير موجود في التخزين.", blockId: block.id });
      continue;
    }
    if (file.ownerType !== PROMPT_FILE_OWNER_TYPE) {
      errors.push({ code: "UNAUTHORIZED_FILE", message: "لا يمكن استخدام هذا الملف في رسالة البوت.", blockId: block.id });
      continue;
    }
    if (block.type === "image") {
      if (!PROMPT_IMAGE_MIMES.includes(file.mimeType)) {
        errors.push({ code: "INVALID_IMAGE_MIME", message: "الصورة يجب أن تكون JPG أو PNG أو WEBP.", blockId: block.id });
        continue;
      }
      if (file.size > PROMPT_IMAGE_MAX_BYTES) {
        errors.push({ code: "IMAGE_TOO_LARGE", message: "حجم الصورة يتجاوز 10MB.", blockId: block.id });
        continue;
      }
    } else if (file.size > PROMPT_DOCUMENT_MAX_BYTES) {
      errors.push({ code: "DOCUMENT_TOO_LARGE", message: "حجم الملف يتجاوز 15MB.", blockId: block.id });
      continue;
    }
    out.push({
      id: block.id,
      type: block.type,
      storageId: block.storageId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
    });
  }
  return { blocks: out, errors };
}
