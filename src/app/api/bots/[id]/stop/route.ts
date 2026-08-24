import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService } from "@/lib/bots/bot-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { NotificationService } from "@/lib/notifications/notification-service";
import { stopBotPolling } from "@/lib/telegram/polling";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    stopBotPolling(id);
    try {
      await TelegramService.deleteWebhook(id);
    } catch {
      /* ignore */
    }
    await BotService.setStatus(id, "STOPPED", user.id, "BOT_STOPPED");
    await NotificationService.notifyAdmins({
      type: "BOT_STOPPED",
      title: "تم إيقاف البوت",
      message: "تم إيقاف البوت",
      botId: id,
    });
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
