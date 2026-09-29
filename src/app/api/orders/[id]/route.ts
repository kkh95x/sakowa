import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";
import { OrderService } from "@/lib/orders/order-service";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { TelegramService } from "@/lib/telegram/telegram-service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const order = await OrderService.get(id);
    if (!order) return json({ error: "NOT_FOUND" }, 404);
    const rt = await RequestTypeService.get(String(order.requestTypeId));
    const history = await OrderService.statusHistory(id);
    const telegramUserId = Number(order.telegramUserId);
    const db = await getDb();
    const tgUser = Number.isFinite(telegramUserId)
      ? await db.collection(collections.telegramUsers).findOne({
          telegramUserId: { $in: [telegramUserId, String(telegramUserId)] },
        })
      : null;
    let photoFileId = tgUser?.photoFileId ? String(tgUser.photoFileId) : "";
    if (Number.isFinite(telegramUserId)) {
      if (photoFileId) {
        void TelegramService.syncUserProfilePhoto(String(order.botId), telegramUserId).catch(() => undefined);
      } else {
        photoFileId = (await TelegramService.syncUserProfilePhoto(String(order.botId), telegramUserId)) ?? "";
      }
    }
    return json({
      order: OrderService.sanitizeOrder({ ...order, id: String(order._id) }, (rt?.fields as never) ?? []),
      photoUrl: photoFileId ? `/api/files/${photoFileId}` : null,
      history,
      requestType: rt ? { id: String(rt._id), name: rt.name, slug: rt.slug, fields: rt.fields } : null,
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
