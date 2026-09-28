import { describe, expect, it } from "vitest";
import {
  applyPromptBlocks,
  editorPromptBlocks,
  fieldAnswerHint,
  fieldPromptText,
  movePromptBlock,
  removePromptBlock,
  resolveFieldPromptBlocks,
  updatePromptBlock,
  validatePromptBlocks,
  verifyPromptFiles,
  withPromptHint,
  type PromptStoredFile,
} from "../src/lib/telegram/field-prompt";
import { TelegramMessageRenderer, type TelegramPromptSender } from "../src/lib/telegram/message-renderer";
import { telegramPromptSchema } from "../src/lib/requests/prompt-schema";
import { isCaptionMessage } from "../src/lib/telegram/telegram-service";
import { normalizeFieldPrompts } from "../src/lib/requests/request-type-service";
import { validateVisibleAnswers, visibleFields, type BranchingRule } from "../src/lib/requests/branching";
import { normalizeTelegramMessage, toDynamicAnswer } from "../src/lib/telegram/normalize-input";
import { parseFieldAnswer } from "../src/lib/orders/field-answer";
import type { RequestField, TelegramPromptBlock } from "../src/types";

const IMG = "a".repeat(24);
const PDF = "b".repeat(24);
const IMG2 = "c".repeat(24);
const FOREIGN = "d".repeat(24);

const storage: Record<string, PromptStoredFile> = {
  [IMG]: { mimeType: "image/png", size: 2048, fileName: "example.png", ownerType: "request_field" },
  [IMG2]: { mimeType: "image/jpeg", size: 4096, fileName: "new.jpg", ownerType: "request_field" },
  [PDF]: { mimeType: "application/pdf", size: 10_240, fileName: "instructions.pdf", ownerType: "request_field" },
  [FOREIGN]: { mimeType: "image/png", size: 100, fileName: "complaint.png", ownerType: "order" },
};
const lookup = async (id: string) => storage[id] ?? null;

function field(partial: Partial<RequestField> & Pick<RequestField, "id" | "name" | "label" | "type">): RequestField {
  return { required: true, sensitive: false, order: 0, active: true, options: [], ...partial };
}

const text = (id: string, value: string): TelegramPromptBlock => ({ id, type: "text", text: value });
const image = (id: string, storageId = IMG): TelegramPromptBlock => ({ id, type: "image", storageId });
const doc = (id: string, storageId = PDF): TelegramPromptBlock => ({ id, type: "document", storageId });

type Call = { method: "text" | "photo" | "document"; value: string; extra?: Record<string, unknown> };
function recordingSender(fail: Partial<Record<Call["method"], boolean>> = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const sender: TelegramPromptSender = {
    log(level, event) {
      logs.push(`${level}:${event}`);
    },
    async sendText(value, extra) {
      if (fail.text) throw new Error("text failed");
      calls.push({ method: "text", value, extra });
    },
    async sendPhoto(storageId, _name, extra) {
      if (fail.photo) throw new Error("photo failed");
      calls.push({ method: "photo", value: storageId, extra });
    },
    async sendDocument(storageId, _name, extra) {
      if (fail.document) throw new Error("document failed");
      calls.push({ method: "document", value: storageId, extra });
    },
  };
  return { calls, sender, logs };
}

async function render(blocks: TelegramPromptBlock[], extra?: Record<string, unknown>, fail = {}) {
  const { calls, sender, logs } = recordingSender(fail);
  const result = await TelegramMessageRenderer.send(TelegramMessageRenderer.plan(blocks), sender, {
    fallbackText: "fallback",
    extra,
  });
  return { calls, result, logs };
}

describe("telegram message composer: block validation and storage", () => {
  it("1. text only", async () => {
    const blocks = [text("t1", "يرجى وصف الشكوى بالتفصيل")];
    expect(validatePromptBlocks(blocks)).toEqual([]);
    const { calls } = await render(blocks);
    expect(calls).toEqual([{ method: "text", value: "يرجى وصف الشكوى بالتفصيل", extra: undefined }]);
  });

  it("2. image only", async () => {
    const verified = await verifyPromptFiles([image("i1")], lookup);
    expect(verified.errors).toEqual([]);
    expect(verified.blocks[0]).toMatchObject({ type: "image", storageId: IMG, fileName: "example.png", mimeType: "image/png", size: 2048 });
    const { calls } = await render(verified.blocks);
    expect(calls.map((c) => c.method)).toEqual(["photo"]);
  });

  it("3. document only", async () => {
    const verified = await verifyPromptFiles([doc("d1")], lookup);
    expect(verified.errors).toEqual([]);
    expect(verified.blocks[0]).toMatchObject({ fileName: "instructions.pdf", mimeType: "application/pdf", size: 10_240 });
    const { calls } = await render(verified.blocks);
    expect(calls.map((c) => c.method)).toEqual(["document"]);
  });

  it("4. text + image", async () => {
    const { calls } = await render([text("t", "صف"), image("i")]);
    expect(calls.map((c) => [c.method, c.value])).toEqual([["text", "صف"], ["photo", IMG]]);
  });

  it("5. text + document", async () => {
    const { calls } = await render([text("t", "أرسل المستند"), doc("d")]);
    expect(calls.map((c) => [c.method, c.value])).toEqual([["text", "أرسل المستند"], ["document", PDF]]);
  });

  it("6. multiple blocks in one message definition", async () => {
    const blocks = [text("t1", "أولاً"), image("i1"), text("t2", "ثانياً"), doc("d1"), image("i2", IMG2)];
    expect(validatePromptBlocks(blocks)).toEqual([]);
    const { calls } = await render(blocks);
    expect(calls.map((c) => c.method)).toEqual(["text", "photo", "text", "document", "photo"]);
  });

  it("7. preserves ordering and supports reordering", async () => {
    const blocks = [text("t", "نص"), image("i"), doc("d")];
    const moved = movePromptBlock(blocks, 2, -1);
    expect(moved.map((b) => b.id)).toEqual(["t", "d", "i"]);
    expect(movePromptBlock(moved, 1, -1).map((b) => b.id)).toEqual(["d", "t", "i"]);
    expect(movePromptBlock(blocks, 0, -1)).toBe(blocks);
    expect(movePromptBlock(blocks, 2, 1)).toBe(blocks);
    const { calls } = await render(moved);
    expect(calls.map((c) => c.method)).toEqual(["text", "document", "photo"]);
  });

  it("8. deleting a block removes it from storage mirror and sending", async () => {
    const f = field({ id: "f", name: "f", label: "وصف", type: "TEXT" });
    const withImage = applyPromptBlocks(f, [text("t", "صف"), image("i")]);
    expect(withImage.imageFileId).toBe(IMG);
    const removed = applyPromptBlocks(withImage, removePromptBlock(withImage.telegramPrompt!.blocks, "i"));
    expect(removed.imageFileId).toBeUndefined();
    expect(removed.telegramPrompt!.blocks.map((b) => b.id)).toEqual(["t"]);
    const { calls } = await render(resolveFieldPromptBlocks(removed));
    expect(calls.map((c) => c.method)).toEqual(["text"]);
  });

  it("9. replacing an attachment keeps position and re-reads metadata from storage", async () => {
    const blocks = [text("t", "صف"), image("i"), doc("d")];
    const replaced = updatePromptBlock(blocks, "i", { storageId: IMG2, fileName: "client-lies.exe", mimeType: "image/png" });
    const verified = await verifyPromptFiles(replaced, lookup);
    expect(verified.errors).toEqual([]);
    expect(verified.blocks[1]).toMatchObject({ id: "i", storageId: IMG2, fileName: "new.jpg", mimeType: "image/jpeg" });
    expect(verified.blocks.map((b) => b.id)).toEqual(["t", "i", "d"]);
  });

  it("10. rejects invalid blocks", async () => {
    const codes = (blocks: unknown) => validatePromptBlocks(blocks).map((e) => e.code);
    expect(codes([text("t", "   ")])).toEqual(["EMPTY_TEXT"]);
    expect(codes([{ id: "i", type: "image", storageId: "" }])).toEqual(["MISSING_IMAGE"]);
    expect(codes([{ id: "d", type: "document", storageId: "" }])).toEqual(["MISSING_DOCUMENT"]);
    expect(codes([{ id: "i", type: "image", storageId: "../etc/passwd" }])).toEqual(["INVALID_STORAGE_ID"]);
    expect(codes([{ id: "v", type: "voice", storageId: IMG }])).toEqual(["UNSUPPORTED_BLOCK"]);
    expect(codes([{ type: "text", text: "x" }])).toEqual(["INVALID_BLOCK"]);
    expect(codes([text("same", "a"), text("same", "b")])).toEqual(["DUPLICATE_BLOCK"]);
    expect(codes("not-an-array")).toEqual(["INVALID_PROMPT"]);

    const missing = await verifyPromptFiles([image("i", "e".repeat(24))], lookup);
    expect(missing.errors.map((e) => e.code)).toEqual(["FILE_NOT_FOUND"]);
    const foreign = await verifyPromptFiles([image("i", FOREIGN)], lookup);
    expect(foreign.errors.map((e) => e.code)).toEqual(["UNAUTHORIZED_FILE"]);
    const pdfAsImage = await verifyPromptFiles([image("i", PDF)], lookup);
    expect(pdfAsImage.errors.map((e) => e.code)).toEqual(["INVALID_IMAGE_MIME"]);

    expect(telegramPromptSchema.safeParse({ blocks: [{ id: "x", type: "sticker" }] }).success).toBe(false);
    expect(telegramPromptSchema.safeParse({ blocks: [{ id: "x", type: "image" }] }).success).toBe(false);
    expect(telegramPromptSchema.safeParse({ blocks: [text("t", "ok"), image("i")] }).success).toBe(true);
  });

  it("10b. service-level normalization rejects invalid prompts and stores verified ones", async () => {
    const base = field({ id: "f", name: "f", label: "وصف الشكوى", type: "TEXT" });
    await expect(
      normalizeFieldPrompts([{ ...base, telegramPrompt: { blocks: [text("t", "")] } }], lookup),
    ).rejects.toThrow(/^INVALID_TELEGRAM_MESSAGE:وصف الشكوى/);
    await expect(
      normalizeFieldPrompts([{ ...base, telegramPrompt: { blocks: [image("i", FOREIGN)] } }], lookup),
    ).rejects.toThrow(/INVALID_TELEGRAM_MESSAGE/);
    const [saved] = await normalizeFieldPrompts(
      [{ ...base, telegramPrompt: { blocks: [text("t", " يرجى وصف الشكوى بالتفصيل "), image("i")] } }],
      lookup,
    );
    expect(saved.telegramPrompt!.blocks).toEqual([
      { id: "t", type: "text", text: "يرجى وصف الشكوى بالتفصيل" },
      { id: "i", type: "image", storageId: IMG, fileName: "example.png", mimeType: "image/png", size: 2048 },
    ]);
    expect(saved.telegramMessage).toBe("يرجى وصف الشكوى بالتفصيل");
    expect(saved.imageFileId).toBe(IMG);
    expect(JSON.stringify(saved)).not.toMatch(/base64|data:/i);
  });
});

describe("telegram message composer: backward compatibility", () => {
  it("11. legacy telegramMessage + imageFileId/attachmentFileId keep working", async () => {
    const legacyText = field({ id: "a", name: "a", label: "الاسم", type: "TEXT", telegramMessage: "ما اسمك؟" });
    expect(resolveFieldPromptBlocks(legacyText)).toEqual([{ id: "legacy_text", type: "text", text: "ما اسمك؟" }]);

    const legacyImage = field({ id: "b", name: "b", label: "QR", type: "IMAGE", telegramMessage: "امسح", imageFileId: IMG });
    expect(resolveFieldPromptBlocks(legacyImage).map((b) => b.type)).toEqual(["text", "image"]);

    const legacyDoc = field({ id: "c", name: "c", label: "ملف", type: "FILE", attachmentFileId: PDF });
    expect(resolveFieldPromptBlocks(legacyDoc)).toEqual([{ id: "legacy_document", type: "document", storageId: PDF }]);

    const bare = field({ id: "d", name: "d", label: "وصف الشكوى", type: "TEXT" });
    expect(resolveFieldPromptBlocks(bare)).toEqual([{ id: "fallback_label", type: "text", text: "وصف الشكوى" }]);
    expect(fieldPromptText(bare)).toBe("وصف الشكوى");

    // legacy fields pass through the service untouched (no destructive migration)
    const [kept] = await normalizeFieldPrompts([legacyImage], lookup);
    expect(kept).toBe(legacyImage);

    // opening a legacy field in the composer converts it; clearing all blocks falls back to the label
    expect(editorPromptBlocks(legacyImage).map((b) => b.type)).toEqual(["text", "image"]);
    const cleared = applyPromptBlocks(legacyImage, []);
    expect(cleared.imageFileId).toBeUndefined();
    expect(cleared.telegramMessage).toBe("");
    expect(resolveFieldPromptBlocks(cleared)).toEqual([{ id: "fallback_label", type: "text", text: "QR" }]);
  });
});

describe("telegram message composer: rendering and sending", () => {
  it("12. attaches answer buttons to the last message and falls back safely", async () => {
    const markup = { reply_markup: { inline_keyboard: [[{ text: "نعم", callback_data: "y:0" }]] } };
    const { calls } = await render([text("t", "هل أنت متزوج؟"), image("i")], markup);
    expect(calls.map((c) => [c.method, Boolean(c.extra)])).toEqual([["text", false], ["photo", true]]);

    const ok = await render([text("t", "صف"), image("i")]);
    expect(ok.result.status).toBe("complete");
    expect(ok.logs).toEqual([]);

    const photoFails = await render([text("t", "صف"), image("i")], undefined, { photo: true });
    expect(photoFails.calls.map((c) => c.method)).toEqual(["text", "document"]);
    expect(photoFails.logs).toEqual(["warn:IMAGE_SEND_FAILED", "warn:IMAGE_FALLBACK_DOCUMENT_SUCCESS"]);
    expect(photoFails.result).toMatchObject({ status: "partial", degraded: ["i"], failed: [] });

    const bothFail = await render([text("t", "صف"), image("i")], undefined, { photo: true, document: true });
    expect(bothFail.logs).toEqual(["warn:IMAGE_SEND_FAILED", "error:IMAGE_FALLBACK_DOCUMENT_FAILED"]);
    expect(bothFail.result).toMatchObject({ status: "partial", sent: ["t"], failed: ["i"] });

    const lastFails = await render([text("t", "اختر"), doc("d")], markup, { document: true });
    expect(lastFails.calls.map((c) => [c.method, c.value, Boolean(c.extra)])).toEqual([
      ["text", "اختر", false],
      ["text", "اختر من الأزرار:", true],
    ]);
    expect(lastFails.result).toMatchObject({ status: "partial", failed: ["d"], buttonsResent: true });
    expect(lastFails.logs).toEqual(["error:DOCUMENT_SEND_FAILED"]);

    const allMediaFail = await render([doc("d")], undefined, { document: true });
    expect(allMediaFail.calls).toEqual([{ method: "text", value: "fallback", extra: undefined }]);
    expect(allMediaFail.result.status).toBe("fallback");

    await expect(render([text("t", "x")], undefined, { text: true })).rejects.toThrow("text failed");

    const planned = TelegramMessageRenderer.plan([text("e", "  "), { id: "i", type: "image", storageId: "" }, text("ok", "x")]);
    expect(planned.map((s) => s.blockId)).toEqual(["ok"]);
  });

  it("button presses on photo/document prompts are edited as captions, text prompts as text", () => {
    expect(isCaptionMessage({ photo: [{}] })).toBe(true);
    expect(isCaptionMessage({ document: { file_id: "d" } })).toBe(true);
    expect(isCaptionMessage({ voice: { file_id: "v" } })).toBe(true);
    expect(isCaptionMessage({ photo: [] })).toBe(false);
    expect(isCaptionMessage({})).toBe(false);
  });

  it("appends the answer hint to the last text block, or adds one", () => {
    const hint = fieldAnswerHint("DYNAMIC")!;
    const merged = withPromptHint([text("t", "يرجى إرسال المستند المطلوب"), doc("d")], hint);
    expect(merged[0]).toMatchObject({ type: "text", text: `يرجى إرسال المستند المطلوب\n\n${hint}` });
    expect(merged[1].type).toBe("document");
    const added = withPromptHint([image("i")], hint);
    expect(added.map((b) => b.type)).toEqual(["image", "text"]);
    expect(fieldAnswerHint("TEXT")).toBeUndefined();
  });

  it("real scenario: شكوى عامة with image and document prompts, voice answer", async () => {
    const description = field({
      id: "desc",
      name: "description",
      label: "وصف الشكوى",
      type: "TEXT",
      telegramPrompt: { blocks: [text("t1", "يرجى وصف الشكوى بالتفصيل"), image("i1")] },
    });
    const documentField = field({
      id: "doc",
      name: "document",
      label: "أرسل المستند",
      type: "DYNAMIC",
      telegramPrompt: { blocks: [text("t2", "يرجى إرسال المستند المطلوب"), doc("d1")] },
    });
    const saved = await normalizeFieldPrompts([description, documentField], lookup);

    const first = await render(withPromptHint(resolveFieldPromptBlocks(saved[0]), fieldAnswerHint(saved[0].type)));
    expect(first.calls.map((c) => [c.method, c.value])).toEqual([
      ["text", "يرجى وصف الشكوى بالتفصيل"],
      ["photo", IMG],
    ]);

    const second = await render(withPromptHint(resolveFieldPromptBlocks(saved[1]), fieldAnswerHint(saved[1].type)));
    expect(second.calls.map((c) => c.method)).toEqual(["text", "document"]);
    expect(second.calls[0].value).toContain("يرجى إرسال المستند المطلوب");
    expect(second.calls[1].value).toBe(PDF);

    const voice = toDynamicAnswer(normalizeTelegramMessage({ voice: { file_id: "voice-1", mime_type: "audio/ogg" } })!);
    const result = validateVisibleAnswers({
      fields: saved,
      rules: [],
      answers: { description: "انقطاع الكهرباء", document: voice },
    });
    expect(result.ok).toBe(true);
    expect(parseFieldAnswer(voice, "DYNAMIC").kind).toBe("audio");
  });
});

describe("telegram message composer: independence from answers and branching", () => {
  it("13. DYNAMIC answers are unaffected by the question blocks", () => {
    const withBlocks = field({
      id: "p",
      name: "proof",
      label: "دليل",
      type: "DYNAMIC",
      telegramPrompt: { blocks: [text("t", "أرسل الدليل"), image("i")] },
    });
    const plain = { ...withBlocks, telegramPrompt: undefined };
    for (const msg of [{ voice: { file_id: "v" } }, { photo: [{ file_id: "p" }] }, { text: "نص" }]) {
      const answer = toDynamicAnswer(normalizeTelegramMessage(msg)!);
      const a = validateVisibleAnswers({ fields: [withBlocks], rules: [], answers: { proof: answer } });
      const b = validateVisibleAnswers({ fields: [plain], rules: [], answers: { proof: answer } });
      expect(a).toEqual(b);
      expect(a.ok).toBe(true);
    }
  });

  it("14. branching still works on fields that have composed messages", () => {
    const married = field({
      id: "married",
      name: "married",
      label: "هل أنت متزوج؟",
      type: "RADIO",
      options: [
        { value: "yes", label: "نعم" },
        { value: "no", label: "لا" },
      ],
      telegramPrompt: { blocks: [text("t", "هل أنت متزوج؟"), image("i")] },
    });
    const children = field({
      id: "children",
      name: "children",
      label: "عدد الأولاد",
      type: "NUMBER",
      order: 1,
      telegramPrompt: { blocks: [doc("d")] },
    });
    const rule: BranchingRule = {
      id: "r",
      sourceFieldId: "married",
      operator: "equals",
      value: "yes",
      action: "show",
      targetFieldId: "children",
    };
    expect(visibleFields([married, children], [rule], { married: "no" }).map((f) => f.id)).toEqual(["married"]);
    expect(visibleFields([married, children], [rule], { married: "yes" }).map((f) => f.id)).toEqual(["married", "children"]);
  });
});
