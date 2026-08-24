import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { resolveUploadMime } from "@/lib/storage/mime";
import { OrderService } from "@/lib/orders/order-service";
import { collections, getDb } from "@/lib/db/client";
import { ObjectId } from "mongodb";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("NO_FILE");
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = file.name || "attachment.bin";
    const mime = resolveUploadMime(filename, file.type);
    const fileId = await GridFSStorageService.save({
      buffer: buf,
      filename,
      mimeType: mime,
      ownerType: "order",
      ownerId: id,
      uploadedBy: user.id,
      purpose: "ADMIN_ATTACHMENT",
    });
    const db = await getDb();
    await db.collection(collections.orders).updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { attachments: fileId }, $set: { updatedAt: new Date() } },
    );
    const order = await OrderService.get(id);
    if (order?.chatId) {
      try {
        await (await import("@/lib/telegram/telegram-service")).TelegramService.sendDocument(
          String(order.botId),
          Number(order.chatId),
          buf,
          filename,
          "مرفق من الإدارة",
        );
      } catch {
        /* telegram optional */
      }
    }
    return json({ fileId });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const order = await OrderService.get(id);
    return json({ attachments: order?.attachments ?? [] });
  } catch (err) {
    return errorToResponse(err);
  }
}
