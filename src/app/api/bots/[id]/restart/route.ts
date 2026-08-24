import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService } from "@/lib/bots/bot-service";
import { TelegramService } from "@/lib/telegram/telegram-service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const connected = await TelegramService.connectBot(id);
    await BotService.setStatus(id, "RUNNING", user.id, "BOT_RESTARTED");
    return json({ ok: true, mode: connected.mode });
  } catch (err) {
    return errorToResponse(err);
  }
}
