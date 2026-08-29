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
import { ensureUniqueFieldNames } from "@/lib/requests/field-names";
import { ChatLogService } from "@/lib/chat/chat-log-service";
import { fieldAnswerLabel, parseFieldAnswer, displayChoice } from "@/lib/orders/field-answer";
import type { OrderFilter, OrderStatus, RequestField } from "@/types";

function peerKeys(value: unknown) {
  if (value == null || value === "") return [];
  const keys = new Set<string>();
  keys.add(String(value));
  const n = Number(value);
  if (Number.isFinite(n) && n !== 0) keys.add(String(n));
  return [...keys];
}

function sameConversation(msg: Record<string, unknown>, order: Record<string, unknown>) {
  if (String(msg.botId) !== String(order.botId)) return false;
  const msgKeys = [...peerKeys(msg.telegramUserId), ...peerKeys(msg.chatId)];
  const orderKeys = [...peerKeys(order.telegramUserId), ...peerKeys(order.chatId)];
  return msgKeys.some((key) => orderKeys.includes(key));
}

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

  /**
   * Realigns the counter with the highest order number already stored. Needed when
   * the counter and the orders collection drift apart (restored dump, reset counter),
   * which otherwise collides with the unique orderNumber index forever.
   */
  private static async resyncNumberCounter() {
    const db = await getDb();
    const [latest] = await db
      .collection(collections.orders)
      .find({}, { projection: { orderNumber: 1 } })
      .sort({ orderNumber: -1 })
      .limit(1)
      .toArray();

    const highest = Number(String(latest?.orderNumber ?? "").replace(/\D/g, "")) || 0;
    await db.collection(collections.orderCounters).updateOne(
      { key: "global" },
      { $max: { seq: highest } },
      { upsert: true },
    );
    logJson("warn", "orders", "ORDER_NUMBER_COUNTER_RESYNCED", { highest });
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

  static userMatch(
    telegramUserId: number,
    extra?: { botId?: string; requestTypeId?: string },
  ) {
    const query: Record<string, unknown> = {
      telegramUserId: { $in: [telegramUserId, String(telegramUserId)] },
    };
    if (extra?.botId) query.botId = extra.botId;
    if (extra?.requestTypeId) {
      const id = extra.requestTypeId;
      query.requestTypeId =
        ObjectId.isValid(id) && String(new ObjectId(id)) === id
          ? { $in: [id, new ObjectId(id)] }
          : id;
    }
    return query;
  }

  static async countsByTelegramUser(
    telegramUserId: number,
    extra?: { botId?: string; requestTypeId?: string },
  ) {
    const db = await getDb();
    const rows = await db
      .collection(collections.orders)
      .aggregate([
        { $match: this.userMatch(telegramUserId, extra) },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();
    const map: Record<OrderStatus, number> = {
      PENDING: 0,
      REVIEWING: 0,
      COMPLETED: 0,
      REJECTED: 0,
      ARCHIVED: 0,
    };
    for (const row of rows) {
      const key = String(row._id) as OrderStatus;
      if (key in map) map[key] = Number(row.count) || 0;
    }
    return map;
  }

  static async listUserServices(telegramUserId: number) {
    const db = await getDb();
    const rows = await db
      .collection(collections.orders)
      .aggregate([
        { $match: this.userMatch(telegramUserId) },
        { $group: { _id: { $toString: "$requestTypeId" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();
    const ids = rows
      .map((row) => String(row._id ?? ""))
      .filter((id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id);
    const types = ids.length
      ? await db
          .collection(collections.requestTypes)
          .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
          .project({ name: 1 })
          .toArray()
      : [];
    const names = new Map(types.map((row) => [String(row._id), String(row.name ?? "")]));
    return rows
      .map((row) => {
        const id = String(row._id ?? "");
        if (!id || id === "null" || id === "undefined") return null;
        return {
          id,
          name: names.get(id) || id,
          count: Number(row.count) || 0,
        };
      })
      .filter((row): row is { id: string; name: string; count: number } => Boolean(row));
  }

  static async listByTelegramUser(params: {
    telegramUserId: number;
    botId?: string;
    requestTypeId?: string;
    status: OrderStatus;
    page?: number;
    pageSize?: number;
  }) {
    const db = await getDb();
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 50, 100);
    const query = {
      ...this.userMatch(params.telegramUserId, {
        botId: params.botId,
        requestTypeId: params.requestTypeId,
      }),
      status: params.status,
    };
    const [items, total] = await Promise.all([
      db
        .collection(collections.orders)
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      db.collection(collections.orders).countDocuments(query),
    ]);
    return { items, total, page, pageSize };
  }

  static summarizeFields(order: Record<string, unknown>, fields: RequestField[]) {
    const values = (order.fields as Record<string, unknown>) ?? {};
    const defs = [...fields]
      .filter((f) => f.active !== false && f.type !== "INSTRUCTION")
      .sort((a, b) => a.order - b.order);
    const rows: {
      label: string;
      value: string;
      kind: "text" | "file" | "image";
      fieldName: string;
      gridFsId: string | null;
      telegramFileId: string | null;
      filename: string | null;
      copyValue: string | null;
    }[] = [];
    for (const field of defs) {
      const raw = Object.prototype.hasOwnProperty.call(values, field.id)
        ? values[field.id]
        : values[field.name];
      if (raw === undefined || raw === null || raw === "") continue;
      if (field.type === "PASSWORD" || field.sensitive) {
        const answer = parseFieldAnswer(raw, field.type);
        const copyValue = typeof raw === "string" ? raw : answer.kind === "text" ? answer.text : null;
        rows.push({
          label: field.label || field.name,
          value: "••••",
          kind: "text",
          fieldName: field.name,
          gridFsId: null,
          telegramFileId: null,
          filename: null,
          copyValue: copyValue && copyValue !== "—" ? copyValue : null,
        });
        continue;
      }
      const answer = parseFieldAnswer(raw, field.type);
      if (answer.kind === "empty") continue;
      const value =
        answer.kind === "text" ? displayChoice(field, raw) || fieldAnswerLabel(answer) : fieldAnswerLabel(answer);
      rows.push({
        label: field.label || field.name,
        value,
        kind: answer.kind === "image" ? "image" : answer.kind === "file" ? "file" : "text",
        fieldName: field.name,
        gridFsId: answer.gridFsId ?? null,
        telegramFileId: answer.telegramFileId ?? null,
        filename: answer.filename ?? null,
        copyValue: null,
      });
    }
    return rows;
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
    const initialOrderNumber = await this.nextNumber();
    const now = new Date();
    const orderId = new ObjectId();

    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(params.requestTypeId),
    });
    const fieldDefs = ensureUniqueFieldNames((request?.fields as RequestField[]) ?? []);
    const persisted = await persistOrderFieldFiles({
      botId: params.botId,
      orderId: String(orderId),
      telegramUserId: params.telegramUserId,
      fields: params.fields,
      fieldDefs,
    });
    const attachmentIds = [...new Set([...(params.attachments ?? []), ...persisted.attachments])];

    let orderNumber = initialOrderNumber;
    let result: { insertedId: ObjectId } | null = null;
    for (let attempt = 1; attempt <= 5 && !result; attempt += 1) {
      try {
        result = await db.collection(collections.orders).insertOne({
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
      } catch (err) {
        const duplicateOrderNumber =
          (err as { code?: number }).code === 11000 &&
          /orderNumber/.test(String((err as { message?: string }).message ?? ""));
        if (!duplicateOrderNumber || attempt === 5) throw err;

        logJson("warn", "orders", "ORDER_NUMBER_CONFLICT", { orderNumber, attempt });
        await this.resyncNumberCounter();
        orderNumber = await this.nextNumber();
      }
    }
    if (!result) throw new Error("ORDER_NUMBER_UNAVAILABLE");
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

    await ChatLogService.run(
      { actor: "admin", orderId: params.orderId, gridFsId: params.fileId },
      async () => {
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
      },
    );

    await audit({
      actorUserId: params.actorId,
      category: "ORDERS",
      action: "ORDER_MESSAGE_SENT",
      entityId: params.orderId,
      metadata: { hasAttachment: Boolean(params.fileId) },
      after: {
        orderId: params.orderId,
        orderNumber: order.orderNumber,
        text,
        hasAttachment: Boolean(params.fileId),
        fileId: params.fileId ?? null,
      },
    });
  }

  static async ownedOutboundMessage(orderId: string, messageId: string) {
    const order = await this.get(orderId);
    if (!order) throw new Error("NOT_FOUND");
    const msg = await ChatLogService.getMessage(messageId);
    if (!msg || msg.deletedAt) {
      logJson("warn", "orders", "CHAT_MESSAGE_NOT_FOUND", { orderId, messageId });
      throw new Error("NOT_FOUND");
    }
    if (!sameConversation(msg as Record<string, unknown>, order as Record<string, unknown>)) {
      logJson("warn", "orders", "CHAT_MESSAGE_NOT_OWNED", {
        orderId,
        messageId,
        msgBot: String(msg.botId),
        orderBot: String(order.botId),
        msgUser: String(msg.telegramUserId),
        orderUser: String(order.telegramUserId),
        msgChat: String(msg.chatId),
        orderChat: String(order.chatId),
        direction: msg.direction,
      });
      throw new Error("NOT_FOUND");
    }
    if (msg.direction !== "out") throw new Error("FORBIDDEN");
    return { order, msg };
  }

  static async editUserMessage(params: { orderId: string; messageId: string; actorId: string; text: string }) {
    const { order, msg } = await this.ownedOutboundMessage(params.orderId, params.messageId);
    const text = params.text.trim();
    const kind = (msg.kind as "text" | "photo" | "document" | "command") || "text";
    const hasMedia =
      kind === "photo" ||
      kind === "document" ||
      Boolean(msg.gridFsId || msg.telegramFileId || msg.filename);
    if (!text && !hasMedia) throw new Error("MESSAGE_REQUIRED");

    let telegramSynced = true;
    const telegramMessageId = Number(msg.telegramMessageId);
    if (Number.isFinite(telegramMessageId) && telegramMessageId > 0) {
      try {
        telegramSynced = await TelegramService.editOutgoingMessage(
          String(order.botId),
          Number(order.chatId) || Number(order.telegramUserId),
          telegramMessageId,
          kind,
          text,
        );
      } catch {
        telegramSynced = false;
      }
    } else {
      telegramSynced = false;
    }

    await ChatLogService.updateText(params.messageId, text);
    await audit({
      actorUserId: params.actorId,
      category: "ORDERS",
      action: "ORDER_MESSAGE_EDITED",
      entityId: params.orderId,
      metadata: { messageId: params.messageId, telegramSynced },
      before: { messageId: params.messageId, text: msg.text ?? msg.caption ?? null },
      after: { messageId: params.messageId, text, telegramSynced },
    });
    return { telegramSynced };
  }

  static async deleteUserMessage(params: { orderId: string; messageId: string; actorId: string }) {
    const { order, msg } = await this.ownedOutboundMessage(params.orderId, params.messageId);
    let telegramSynced = true;
    const telegramMessageId = Number(msg.telegramMessageId);
    if (Number.isFinite(telegramMessageId) && telegramMessageId > 0) {
      try {
        telegramSynced = await TelegramService.deleteOutgoingMessage(
          String(order.botId),
          Number(order.chatId) || Number(order.telegramUserId),
          telegramMessageId,
        );
      } catch {
        telegramSynced = false;
      }
    } else {
      telegramSynced = false;
    }

    await ChatLogService.softDelete(params.messageId);
    await audit({
      actorUserId: params.actorId,
      category: "ORDERS",
      action: "ORDER_MESSAGE_DELETED",
      entityId: params.orderId,
      metadata: { messageId: params.messageId, telegramSynced },
      before: {
        messageId: params.messageId,
        text: msg.text ?? msg.caption ?? null,
        kind: msg.kind ?? null,
      },
    });
    return { telegramSynced };
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
      before: {
        orderNumber: order.orderNumber,
        status: from,
        lastUpdatedBy: order.lastUpdatedBy ?? null,
      },
      after: {
        orderNumber: order.orderNumber,
        status: params.next,
        lastUpdatedBy: params.actorId,
        message: params.message ?? null,
        hasAttachment: Boolean(params.attachmentFileId),
      },
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
        await ChatLogService.run(
          { actor: "admin", orderId: params.orderId, gridFsId: params.attachmentFileId },
          async () => {
            await TelegramService.notifyUserStatus(
              order,
              params.next,
              params.message,
              params.attachmentFileId,
            );
            await TelegramService.notifyGroupStatus(order, from, params.next, params.actorId);
          },
        );
      } catch {
        // ignore telegram failures
      }
    }
  }
}
