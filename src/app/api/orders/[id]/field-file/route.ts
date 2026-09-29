import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { errorToResponse, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";
import { OrderService } from "@/lib/orders/order-service";
import { parseFieldAnswer } from "@/lib/orders/field-answer";
import { orderFieldDefinitions } from "@/lib/orders/order-field-rows";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { fileHttpResponse } from "@/lib/storage/file-response";
import { resolveUploadMime } from "@/lib/storage/mime";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { logJson } from "@/lib/log";
import type { FilePurpose, RequestField } from "@/types";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const field = new URL(req.url).searchParams.get("field");
    if (!field) throw new Error("NO_FIELD");

    const order = await OrderService.get(id);
    if (!order) throw new Error("NOT_FOUND");

    const values = (order.fields as Record<string, unknown>) ?? {};
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(String(order.requestTypeId)),
    });
    const fieldDef = orderFieldDefinitions(order, (request?.fields as RequestField[]) ?? []).find(
      (f) => f.name === field,
    );
    const answer = parseFieldAnswer(values[field], fieldDef?.type);

    if (!answer.gridFsId && !answer.telegramFileId) throw new Error("NOT_FOUND");

    if (answer.gridFsId) {
      const file = await GridFSStorageService.readBuffer(answer.gridFsId);
      if (file) return fileHttpResponse(file);
    }

    if (!answer.telegramFileId) throw new Error("NOT_FOUND");

    const downloaded = await TelegramService.downloadFile(String(order.botId), answer.telegramFileId);
    const filename = answer.filename || downloaded.filename;
    const mimeType = resolveUploadMime(filename, downloaded.mimeType);

    try {
      const purpose: FilePurpose = fieldDef?.type === "IMAGE" ? "REQUEST_IMAGE" : "ORDER_ATTACHMENT";
      const gridFsId = await GridFSStorageService.save({
        buffer: downloaded.buffer,
        filename,
        mimeType,
        ownerType: "order",
        ownerId: id,
        uploadedBy: String(order.telegramUserId ?? "telegram"),
        purpose,
      });
      const current = values[field];
      const nextFields = {
        ...values,
        [field]:
          current && typeof current === "object"
            ? { ...(current as Record<string, unknown>), gridFsId, filename }
            : {
                telegramFileId: answer.telegramFileId,
                kind: answer.kind === "image" ? "photo" : "document",
                gridFsId,
                filename,
              },
      };
      await db.collection(collections.orders).updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { fields: nextFields, updatedAt: new Date() },
          $addToSet: { attachments: gridFsId },
        },
      );
    } catch (err) {
      logJson("error", "orders", "FIELD_FILE_BACKFILL_FAILED", {
        orderId: id,
        field,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error("FIELD_FILE_BACKFILL_FAILED", { orderId: id, field, error: err });
    }

    return fileHttpResponse({ buffer: downloaded.buffer, mimeType, filename });
  } catch (err) {
    logJson("error", "orders", "FIELD_FILE_GET_FAILED", {
      orderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error("FIELD_FILE_GET_FAILED", err);
    return errorToResponse(err);
  }
}
