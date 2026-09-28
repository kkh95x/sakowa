import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService, serializeBot } from "@/lib/bots/bot-service";
import { telegramPromptSchema } from "@/lib/requests/prompt-schema";
import { normalizePromptBlocks } from "@/lib/telegram/prompt-storage";
import { ar } from "@/i18n/ar";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const bot = await BotService.get(id);
    if (!bot) return json({ error: "NOT_FOUND" }, 404);
    return json({ bot: serializeBot(bot as Record<string, unknown>) });
  } catch (err) {
    return errorToResponse(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  details: z.string().max(2000).optional(),
  welcomePrompt: telegramPromptSchema.nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const bot = await BotService.get(id);
    if (!bot) return json({ error: "NOT_FOUND" }, 404);
    const body = patchSchema.parse(await req.json());
    const welcomePrompt =
      body.welcomePrompt === undefined
        ? undefined
        : body.welcomePrompt && body.welcomePrompt.blocks.length
          ? { blocks: await normalizePromptBlocks(body.welcomePrompt.blocks, ar.welcomeMessage) }
          : null;
    await BotService.update(id, { ...body, welcomePrompt, actorId: user.id });
    const updated = await BotService.get(id);
    if (!updated) return json({ error: "NOT_FOUND" }, 404);
    return json({ bot: serializeBot(updated as Record<string, unknown>) });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const bot = await BotService.get(id);
    if (!bot) return json({ error: "NOT_FOUND" }, 404);
    try {
      const { TelegramService } = await import("@/lib/telegram/telegram-service");
      await TelegramService.deleteWebhook(id);
    } catch {
      /* webhook cleanup is best-effort */
    }
    await BotService.remove(id, user.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
