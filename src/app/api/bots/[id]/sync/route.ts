import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService } from "@/lib/bots/bot-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { audit } from "@/lib/audit/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const bot = await BotService.get(id);
    if (!bot) return json({ error: "NOT_FOUND" }, 404);
    const result = await TelegramService.syncBotProfile(id);
    await audit({
      actorUserId: user.id,
      category: "BOTS",
      action: "BOT_SYNCED_TELEGRAM",
      entityId: id,
    });
    return json({ ok: true, result });
  } catch (err) {
    return errorToResponse(err);
  }
}
