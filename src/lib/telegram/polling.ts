import { TelegramConversationService } from "@/lib/telegram/conversation";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { logJson } from "@/lib/log";

const offsets = new Map<string, number>();
const running = new Set<string>();
const loops = new Map<string, Promise<void>>();

import { isBlockedWebhookBase } from "@/lib/telegram/api";

export function webhookBaseUsable() {
  const base = (process.env.TELEGRAM_WEBHOOK_BASE_URL ?? "").trim();
  if (isBlockedWebhookBase(base)) return false;
  try {
    const url = new URL(base);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function shouldUsePolling() {
  if (process.env.TELEGRAM_USE_POLLING === "1" || process.env.TELEGRAM_USE_POLLING === "true") return true;
  return !webhookBaseUsable();
}

export function isBotPolling(botId: string) {
  return running.has(botId);
}

export function stopBotPolling(botId: string) {
  running.delete(botId);
}

async function pollOnce(botId: string) {
  const offset = offsets.get(botId) ?? 0;
  const json = await TelegramService.getUpdates(botId, offset, 25);
  if (!json?.ok || !Array.isArray(json.result)) return;
  for (const update of json.result) {
    const updateId = Number(update.update_id);
    if (!Number.isFinite(updateId)) continue;
    offsets.set(botId, updateId + 1);
    try {
      await TelegramConversationService.process(botId, update);
    } catch (err) {
      logJson("error", "telegram", "poll_process_failed", {
        botId,
        updateId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function pollLoop(botId: string) {
  while (running.has(botId)) {
    try {
      await pollOnce(botId);
    } catch (err) {
      logJson("error", "telegram", "poll_failed", {
        botId,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export function startBotPolling(botId: string) {
  if (running.has(botId)) return;
  running.add(botId);
  const loop = pollLoop(botId).finally(() => {
    loops.delete(botId);
  });
  loops.set(botId, loop);
  logJson("info", "telegram", "polling_started", { botId });
}

/** @deprecated use TelegramService.reconnectRunningBots */
export async function ensurePollingForRunningBots() {
  return TelegramService.reconnectRunningBots();
}
