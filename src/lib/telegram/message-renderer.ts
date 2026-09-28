import type { TelegramPromptBlock } from "@/types";

export type TelegramSendStep =
  | { kind: "text"; blockId: string; text: string }
  | { kind: "photo"; blockId: string; storageId: string; fileName: string }
  | { kind: "document"; blockId: string; storageId: string; fileName: string };

export type PromptLogLevel = "info" | "warn" | "error";

export interface TelegramPromptSender {
  /** Implementations must throw when Telegram rejects the call (`ok: false`). */
  sendText(text: string, extra?: Record<string, unknown>): Promise<unknown>;
  sendPhoto(storageId: string, fileName: string, extra?: Record<string, unknown>): Promise<unknown>;
  sendDocument(storageId: string, fileName: string, extra?: Record<string, unknown>): Promise<unknown>;
  log?(level: PromptLogLevel, event: string, data: Record<string, unknown>): void;
}

export type TelegramRenderStatus =
  /** every block was delivered as configured */
  | "complete"
  /** some blocks failed or an image had to be delivered as a document */
  | "partial"
  /** no block could be delivered; the fallback text was sent instead */
  | "fallback";

export type TelegramRenderResult = {
  status: TelegramRenderStatus;
  sent: string[];
  failed: string[];
  /** image blocks delivered through the sendDocument fallback */
  degraded: string[];
  /** the answer buttons had to be re-sent in a separate message */
  buttonsResent: boolean;
};

export const BUTTONS_PROMPT = "اختر من الأزرار:";

const FAILURE_EVENT: Record<TelegramSendStep["kind"], string> = {
  text: "TEXT_SEND_FAILED",
  photo: "IMAGE_SEND_FAILED",
  document: "DOCUMENT_SEND_FAILED",
};

export class TelegramMessageRenderer {
  /** One Telegram API call per block, in block order. Unusable blocks are skipped. */
  static plan(blocks: TelegramPromptBlock[]): TelegramSendStep[] {
    const steps: TelegramSendStep[] = [];
    for (const block of blocks) {
      if (block.type === "text") {
        const text = block.text?.trim();
        if (text) steps.push({ kind: "text", blockId: block.id, text: text.slice(0, 4096) });
      } else if (block.type === "image" && block.storageId) {
        steps.push({ kind: "photo", blockId: block.id, storageId: block.storageId, fileName: block.fileName || "image.jpg" });
      } else if (block.type === "document" && block.storageId) {
        steps.push({ kind: "document", blockId: block.id, storageId: block.storageId, fileName: block.fileName || "file.bin" });
      }
    }
    return steps;
  }

  /**
   * Sends the steps in order. `extra.reply_markup` (answer buttons) is attached to the
   * last message; if that message fails, the buttons are re-sent with a short text so
   * the user can still answer. A failing block never aborts the remaining blocks.
   */
  static async send(
    steps: TelegramSendStep[],
    sender: TelegramPromptSender,
    options: { fallbackText: string; extra?: Record<string, unknown> },
  ): Promise<TelegramRenderResult> {
    const result: TelegramRenderResult = { status: "complete", sent: [], failed: [], degraded: [], buttonsResent: false };
    const hasMarkup = Boolean(options.extra?.reply_markup);
    let markupDelivered = false;
    let lastError: unknown = null;
    const log = (level: PromptLogLevel, event: string, data: Record<string, unknown>) => sender.log?.(level, event, data);

    for (const [i, step] of steps.entries()) {
      const extra = i === steps.length - 1 ? options.extra : undefined;
      try {
        if (step.kind === "text") {
          await sender.sendText(step.text, extra);
        } else if (step.kind === "photo") {
          await sendImageWithFallback(step, sender, extra, log, result);
        } else {
          await sender.sendDocument(step.storageId, step.fileName, extra);
        }
        result.sent.push(step.blockId);
        if (extra && hasMarkup) markupDelivered = true;
      } catch (err) {
        lastError = err;
        result.failed.push(step.blockId);
        if (step.kind !== "photo") {
          log("error", FAILURE_EVENT[step.kind], { blockId: step.blockId, error: errorText(err) });
        }
      }
    }

    if (result.sent.length === 0) {
      result.status = "fallback";
      try {
        await sender.sendText(options.fallbackText, options.extra);
      } catch (err) {
        log("error", "PROMPT_FALLBACK_TEXT_FAILED", { error: errorText(err) });
        throw lastError ?? err;
      }
      return result;
    }
    if (hasMarkup && !markupDelivered) {
      result.buttonsResent = true;
      await sender.sendText(BUTTONS_PROMPT, options.extra);
    }
    if (result.failed.length || result.degraded.length) result.status = "partial";
    return result;
  }
}

async function sendImageWithFallback(
  step: Extract<TelegramSendStep, { kind: "photo" }>,
  sender: TelegramPromptSender,
  extra: Record<string, unknown> | undefined,
  log: (level: PromptLogLevel, event: string, data: Record<string, unknown>) => void,
  result: TelegramRenderResult,
) {
  try {
    await sender.sendPhoto(step.storageId, step.fileName, extra);
    return;
  } catch (photoErr) {
    log("warn", "IMAGE_SEND_FAILED", { blockId: step.blockId, error: errorText(photoErr) });
  }
  try {
    await sender.sendDocument(step.storageId, step.fileName, extra);
    result.degraded.push(step.blockId);
    log("warn", "IMAGE_FALLBACK_DOCUMENT_SUCCESS", { blockId: step.blockId });
  } catch (docErr) {
    log("error", "IMAGE_FALLBACK_DOCUMENT_FAILED", { blockId: step.blockId, error: errorText(docErr) });
    throw docErr;
  }
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
