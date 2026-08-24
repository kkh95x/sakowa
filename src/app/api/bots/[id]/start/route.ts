import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService } from "@/lib/bots/bot-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { NotificationService } from "@/lib/notifications/notification-service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const connected = await TelegramService.connectBot(id);
    await BotService.setStatus(id, "RUNNING", user.id, "BOT_STARTED");
    await NotificationService.notifyAdmins({
      type: "BOT_STARTED",
      title: "تم تشغيل البوت",
      message:
        connected.mode === "polling"
          ? "تم تشغيل البوت بنجاح (وضع التطوير: polling)"
          : "تم تشغيل البوت بنجاح",
      botId: id,
    });
    return json({ ok: true, mode: connected.mode });
  } catch (err) {
    return errorToResponse(err);
  }
}
