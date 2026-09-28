import type { TelegramPrompt, TelegramPromptBlock } from "@/types";

export const WELCOME_GREETING = "أهلاً بك 👋";
export const WELCOME_CHOOSE_TYPE = "اختر نوع الشكوى:";
export const WELCOME_NO_TYPES = "لا توجد أنواع شكاوى مفعّلة حالياً.";

/** The message sent when the bot has no configured welcome composition. */
export function defaultWelcomeText(hasActiveTypes: boolean) {
  return `${WELCOME_GREETING}\n\n${hasActiveTypes ? WELCOME_CHOOSE_TYPE : WELCOME_NO_TYPES}`;
}

type WelcomeBot = { welcomePrompt?: TelegramPrompt | null } | null | undefined;

/** Blocks saved by the administrator, or `[]` when the bot uses the default welcome. */
export function welcomePromptBlocks(bot: WelcomeBot): TelegramPromptBlock[] {
  const blocks = bot?.welcomePrompt?.blocks;
  return Array.isArray(blocks) ? blocks : [];
}

export function hasWelcomePrompt(bot: WelcomeBot) {
  return welcomePromptBlocks(bot).length > 0;
}

/**
 * Blocks the bot sends for /start. Without a custom composition this is the single
 * default text; with one it is the configured blocks, plus the "no active types"
 * notice so that information is never lost.
 */
export function resolveWelcomeBlocks(bot: WelcomeBot, hasActiveTypes: boolean): TelegramPromptBlock[] {
  const blocks = welcomePromptBlocks(bot);
  if (!blocks.length) {
    return [{ id: "welcome_default", type: "text", text: defaultWelcomeText(hasActiveTypes) }];
  }
  if (hasActiveTypes) return blocks;
  return [...blocks, { id: "welcome_no_types", type: "text", text: WELCOME_NO_TYPES }];
}
