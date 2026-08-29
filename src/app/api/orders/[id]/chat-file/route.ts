import { errorToResponse, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { fileHttpResponse } from "@/lib/storage/file-response";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { resolveUploadMime } from "@/lib/storage/mime";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const order = await OrderService.get(id);
    if (!order) throw new Error("NOT_FOUND");
    const url = new URL(req.url);
    const gridFsId = url.searchParams.get("id");
    const telegramFileId = url.searchParams.get("tg");

    if (gridFsId) {
      const file = await GridFSStorageService.readBuffer(gridFsId);
      if (!file) throw new Error("NOT_FOUND");
      return fileHttpResponse(file);
    }
    if (!telegramFileId) throw new Error("NOT_FOUND");
    const downloaded = await TelegramService.downloadFile(String(order.botId), telegramFileId);
    const filename = downloaded.filename || "telegram-file.bin";
    return fileHttpResponse({
      buffer: downloaded.buffer,
      mimeType: resolveUploadMime(filename, downloaded.mimeType),
      filename,
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
