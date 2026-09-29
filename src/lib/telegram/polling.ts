import { isBlockedWebhookBase } from "@/lib/telegram/api";
import { TelegramConversationService } from "@/lib/telegram/conversation";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { logJson } from "@/lib/log";

type PollRegistry = {
  /** Bumped every time this module is evaluated, so a hot reload retires the previous loop. */
  generation: number;
  offsets: Map<string, number>;
  running: Set<string>;
};

const REGISTRY_KEY = "__shakowaTelegramPolling";

function registry(): PollRegistry {
  const g = globalThis as typeof globalThis & { [REGISTRY_KEY]?: PollRegistry };
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = { generation: 0, offsets: new Map(), running: new Set() };
  }
  return g[REGISTRY_KEY];
}

/**
 * Hot reload evaluates this file again while the previous poll loop is still inside
 * getUpdates. A second loop would keep serving Telegram updates with the old handlers,
 * so field audio (and any other send-path fix) never reached the chat. One registry on
 * globalThis lets the new evaluation take over and the previous loop exit.
 */
const replaced = registry();
const resumeBotIds = [...replaced.running];
replaced.generation += 1;
replaced.running = new Set();

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
  return registry().running.has(botId);
}

export function stopBotPolling(botId: string) {
  registry().running.delete(botId);
}

async function pollOnce(botId: string) {
  const current = registry();
  const offset = current.offsets.get(botId) ?? 0;
  const json = await TelegramService.getUpdates(botId, offset, 25);
  if (!json?.ok || !Array.isArray(json.result)) return;
  for (const update of json.result) {
    const updateId = Number(update.update_id);
    if (!Number.isFinite(updateId)) continue;
    current.offsets.set(botId, updateId + 1);
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

async function pollLoop(botId: string, generation: number) {
  while (registry().generation === generation && registry().running.has(botId)) {
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
  const current = registry();
  if (current.running.has(botId)) return;
  current.running.add(botId);
  void pollLoop(botId, current.generation);
  logJson("info", "telegram", "polling_started", { botId });
}

for (const botId of resumeBotIds) startBotPolling(botId);

/** @deprecated use TelegramService.reconnectRunningBots */
export async function ensurePollingForRunningBots() {
  return TelegramService.reconnectRunningBots();
}
