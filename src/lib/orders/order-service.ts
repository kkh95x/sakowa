import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { OrderFilterBuilder } from "@/lib/orders/filter-builder";
import { audit } from "@/lib/audit/audit";
import { NotificationService } from "@/lib/notifications/notification-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import { decrypt } from "@/lib/security/crypto";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { logJson } from "@/lib/log";
import { persistOrderFieldFiles } from "@/lib/orders/persist-order-files";
import type { OrderFilter, OrderStatus, RequestField } from "@/types";

function tryDecryptStored(value: string): string {
  if (!/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i.test(value)) return value;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["REVIEWING", "REJECTED", "ARCHIVED"],
  REVIEWING: ["COMPLETED", "REJECTED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: [],
};

export class OrderStatusService {
  static canTransition(from: OrderStatus, to: OrderStatus) {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }
}

export class OrderService {
  static async nextNumber() {
    const db = await getDb();
    const result = await db.collection(collections.orderCounters).findOneAndUpdate(
      { key: "global" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    const seq = Number(result?.seq ?? 1);
    return `ORD-${String(seq).padStart(5, "0")}`;
  }

  static async countsByStatus(requestTypeId: string) {
    const db = await getDb();
    const rows = await db
      .collection(collections.orders)
      .aggregate([
        { $match: { requestTypeId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();
    const map: Record<string, number> = {
      PENDING: 0,
      REVIEWING: 0,
      COMPLETED: 0,
      REJECTED: 0,
      ARCHIVED: 0,
    };
    for (const row of rows) map[String(row._id)] = row.count;
    return map;
  }

  static async list(params: {
    requestTypeId: string;
    status: OrderStatus;
    filters?: OrderFilter[];
    search?: string;
    page?: number;
    pageSize?: number;
    sort?: "createdAt" | "orderNumber";
    dir?: 1 | -1;
  }) {
    const db = await getDb();
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const filterQuery = OrderFilterBuilder.build(params.filters ?? []);
    const query: Record<string, unknown> = {
      requestTypeId: params.requestTypeId,
      status: params.status,
      ...filterQuery,
    };
    if (params.search) {
      query.$or = [
        { orderNumber: { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        { telegramUsername: { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        { telegramName: { $regex: params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      ];
    }
    const sortField = params.sort ?? "createdAt";
    const dir = params.dir ?? -1;
    const [items, total] = await Promise.all([
      db
        .collection(collections.orders)
        .find(query)
        .sort({ [sortField]: dir })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      db.collection(collections.orders).countDocuments(query),
    ]);
    return { items, total, page, pageSize };
  }

  static sanitizeOrder(order: Record<string, unknown>, _fields: RequestField[]) {
    const cloned = { ...order };
    const fieldValues = { ...((order.fields as Record<string, unknown>) ?? {}) };
    for (const key of Object.keys(fieldValues)) {
      if (typeof fieldValues[key] === "string") {
        fieldValues[key] = tryDecryptStored(fieldValues[key] as string);
      }
    }
    cloned.fields = fieldValues;
    return cloned;
  }

  static async get(id: string) {
    const db = await getDb();
    return db.collection(collections.orders).findOne({ _id: new ObjectId(id) });
  }

  static async submit(params: {
    botId: string;
    requestTypeId: string;
    telegramUserId: number;
    chatId: number;
    telegramUsername?: string;
    telegramName?: string;
    fields: Record<string, unknown>;
    attachments?: string[];
  }) {
    const db = await getDb();
    const orderNumber = await this.nextNumber();
    const now = new Date();
    const orderId = new ObjectId();

    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(params.requestTypeId),
    });
    const fieldDefs = (request?.fields as RequestField[]) ?? [];
    const persisted = await persistOrderFieldFiles({
      botId: params.botId,
      orderId: String(orderId),
      telegramUserId: params.telegramUserId,
      fields: params.fields,
      fieldDefs,
    });
    const attachmentIds = [...new Set([...(params.attachments ?? []), ...persisted.attachments])];

    const result = await db.collection(collections.orders).insertOne({
      _id: orderId,
      orderNumber,
      botId: params.botId,
      requestTypeId: params.requestTypeId,
      telegramUserId: params.telegramUserId,
      chatId: params.chatId,
      telegramUsername: params.telegramUsername ?? null,
      telegramName: params.telegramName ?? null,
      status: "PENDING",
      fields: persisted.fields,
      attachments: attachmentIds,
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
      archivedAt: null,
      lastUpdatedBy: null,
    });
    await db.collection(collections.orderStatusHistory).insertOne({
      orderId: String(result.insertedId),
      previousStatus: null,
      newStatus: "PENDING",
      changedBy: "TELEGRAM_USER",
      message: null,
      createdAt: now,
    });
    await NotificationService.notifyAdminsNewOrder({
      orderId: String(result.insertedId),
      orderNumber,
      requestTypeId: params.requestTypeId,
      botId: params.botId,
      telegramUsername: params.telegramUsername,
    });
    try {
      await TelegramService.notifyGroupNewOrder(params.requestTypeId, {
        orderNumber,
        telegramUsername: params.telegramUsername,
        telegramUserId: params.telegramUserId,
        fields: persisted.fields,
      });
    } catch {
      // group notification must not fail order
    }
    logJson("info", "telegram", "ORDER_CREATED", {
      orderId: String(result.insertedId),
      botId: params.botId,
      requestTypeId: params.requestTypeId,
    });
    return { id: String(result.insertedId), orderNumber };
  }

  static async sendUserMessage(params: { orderId: string; actorId: string; message: string; fileId?: string }) {
    const order = await this.get(params.orderId);
    if (!order) throw new Error("NOT_FOUND");
    const botId = String(order.botId);
    const chatId = Number(order.chatId);
    const text = params.message.trim();

    if (params.fileId) {
      const file = await GridFSStorageService.readBuffer(params.fileId);
      if (!file) throw new Error("FILE_NOT_FOUND");
      if (file.mimeType.startsWith("image/")) {
        await TelegramService.sendPhoto(botId, chatId, file.buffer, file.filename, text || undefined);
      } else {
        await TelegramService.sendDocument(botId, chatId, file.buffer, file.filename, text || undefined);
      }
    } else if (text) {
      await TelegramService.sendMessage(botId, chatId, text);
    } else {
      throw new Error("MESSAGE_OR_FILE_REQUIRED");
    }

    await audit({
      actorUserId: params.actorId,
      category: "ORDERS",
      action: "ORDER_MESSAGE_SENT",
      entityId: params.orderId,
      metadata: { hasAttachment: Boolean(params.fileId) },
    });
    await NotificationService.notifyAdmins({
      type: "ORDER_MESSAGE",
      title: "رسالة على طلب",
      message: `${order.orderNumber}: تم إرسال رسالة للمستخدم`,
      orderId: params.orderId,
      requestTypeId: String(order.requestTypeId),
      botId: String(order.botId),
      entityType: "order",
      entityId: params.orderId,
    });
  }

  static async changeStatus(params: {
    orderId: string;
    next: OrderStatus;
    actorId: string;
    message?: string;
    attachmentFileId?: string;
  }) {
    const db = await getDb();
    const order = await this.get(params.orderId);
    if (!order) throw new Error("NOT_FOUND");
    const from = order.status as OrderStatus;
    if (!OrderStatusService.canTransition(from, params.next)) {
      throw new Error("INVALID_TRANSITION");
    }
    const now = new Date();
    await db.collection(collections.orders).updateOne(
      { _id: new ObjectId(params.orderId) },
      {
        $set: {
          status: params.next,
          updatedAt: now,
          lastUpdatedBy: params.actorId,
          ...(params.next === "ARCHIVED" ? { archivedAt: now } : {}),
          ...(params.attachmentFileId
            ? { attachments: [...((order.attachments as string[]) ?? []), params.attachmentFileId] }
            : {}),
        },
      },
    );
    await db.collection(collections.orderStatusHistory).insertOne({
      orderId: params.orderId,
      previousStatus: from,
      newStatus: params.next,
      changedBy: params.actorId,
      message: params.message ?? null,
      attachmentFileId: params.attachmentFileId ?? null,
      createdAt: now,
    });
    await audit({
      actorUserId: params.actorId,
      category: "ORDERS",
      action: "ORDER_STATUS_CHANGED",
      entityId: params.orderId,
      metadata: { from, to: params.next, hasAttachment: Boolean(params.attachmentFileId) },
    });
    if (params.next !== "ARCHIVED") {
      await NotificationService.notifyAdmins({
        type: "ORDER_STATUS_CHANGED",
        title: "تحديث طلب",
        message: `${order.orderNumber}: ${from} → ${params.next}`,
        orderId: params.orderId,
        requestTypeId: order.requestTypeId,
        botId: order.botId,
        entityType: "order",
        entityId: params.orderId,
      });
      try {
        await TelegramService.notifyUserStatus(
          order,
          params.next,
          params.message,
          params.attachmentFileId,
        );
        await TelegramService.notifyGroupStatus(order, from, params.next, params.actorId);
      } catch {
        // ignore telegram failures
      }
    }
  }
}
