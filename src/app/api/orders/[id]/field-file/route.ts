import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { errorToResponse, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";
import { OrderService } from "@/lib/orders/order-service";
import { parseFieldAnswer } from "@/lib/orders/field-answer";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { TelegramService } from "@/lib/telegram/telegram-service";
import type { RequestField } from "@/types";

type Ctx = { params: Promise<{ id: string }> };

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "file.bin";
  const encoded = encodeURIComponent(filename);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const field = new URL(req.url).searchParams.get("field");
    if (!field) throw new Error("NO_FIELD");

    const order = await OrderService.get(id);
    if (!order) throw new Error("NOT_FOUND");

    const values = (order.fields as Record<string, unknown>) ?? {};
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(String(order.requestTypeId)),
    });
    const fieldDef = ((request?.fields as RequestField[]) ?? []).find((f) => f.name === field);
    const answer = parseFieldAnswer(values[field], fieldDef?.type);

    if (!answer.gridFsId && !answer.telegramFileId) throw new Error("NOT_FOUND");

    if (answer.gridFsId) {
      const file = await GridFSStorageService.readBuffer(answer.gridFsId);
      if (!file) throw new Error("NOT_FOUND");
      return new NextResponse(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Disposition": contentDisposition(file.filename),
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const downloaded = await TelegramService.downloadFile(String(order.botId), answer.telegramFileId!);
    const filename = answer.filename || downloaded.filename;
    return new NextResponse(new Uint8Array(downloaded.buffer), {
      headers: {
        "Content-Type": downloaded.mimeType || "application/octet-stream",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
