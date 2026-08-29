import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { ChatLogService } from "@/lib/chat/chat-log-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { collections, getDb } from "@/lib/db/client";
import type { RequestField } from "@/types";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const raw = await OrderService.get(id);
    if (!raw) throw new Error("NOT_FOUND");
    const request = await RequestTypeService.get(String(raw.requestTypeId));
    const fields = (request?.fields as RequestField[]) ?? [];
    const order = OrderService.sanitizeOrder({ ...raw, id: String(raw._id) }, fields);
    const url = new URL(req.url);
    const before = url.searchParams.get("before");
    const limitRaw = Number(url.searchParams.get("limit") || 40);
    const { messages, hasOlder } = await ChatLogService.listForOrder(order, fields, {
      before,
      limit: Number.isFinite(limitRaw) ? limitRaw : 40,
      requestName: request?.name ? String(request.name) : null,
    });
    const db = await getDb();
    const telegramUserId = Number(order.telegramUserId);
    const tgUser = await db.collection(collections.telegramUsers).findOne({
      telegramUserId: { $in: [telegramUserId, String(telegramUserId)] },
    });
    const photoFileId = tgUser?.photoFileId ? String(tgUser.photoFileId) : null;
    void TelegramService.syncUserProfilePhoto(String(order.botId), telegramUserId).catch(() => {
      /* keep cached photo */
    });
    const lastInbound = [...messages].reverse().find((m) => m.direction === "in")?.createdAt;
    const lastSeenAt = [tgUser?.lastSeenAt, lastInbound]
      .filter(Boolean)
      .map((v) => new Date(String(v)).getTime())
      .reduce((max, n) => Math.max(max, n), 0);
    const online = lastSeenAt > 0 && Date.now() - lastSeenAt < 3 * 60 * 1000;
    const name = [tgUser?.firstName, tgUser?.lastName].filter(Boolean).join(" ")
      || String(order.telegramName || order.telegramUsername || telegramUserId);

    const res = json({
      peer: {
        name,
        username: (tgUser?.username || order.telegramUsername)
          ? String(tgUser?.username || order.telegramUsername).replace(/^@/, "")
          : null,
        telegramUserId,
        photoUrl: photoFileId ? `/api/files/${photoFileId}` : null,
        lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
        online,
      },
      orderNumber: String(order.orderNumber),
      hasOlder,
      messages: messages.map((m) => ({
        ...m,
        fileUrl: m.gridFsId
          ? `/api/files/${m.gridFsId}`
          : m.telegramFileId
            ? `/api/orders/${id}/chat-file?tg=${encodeURIComponent(m.telegramFileId)}`
            : null,
      })),
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    return errorToResponse(err);
  }
}

const editSchema = z.object({
  messageId: z.string().min(1),
  text: z.string().max(4096),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const body = editSchema.parse(await req.json());
    const result = await OrderService.editUserMessage({
      orderId: id,
      messageId: body.messageId,
      actorId: user.id,
      text: body.text,
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const messageId = url.searchParams.get("messageId") || "";
    if (!messageId) throw new Error("NOT_FOUND");
    const result = await OrderService.deleteUserMessage({
      orderId: id,
      messageId,
      actorId: user.id,
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return errorToResponse(err);
  }
}
