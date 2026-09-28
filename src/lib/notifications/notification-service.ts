import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { WebPushService } from "@/lib/notifications/web-push-service";
import { logJson } from "@/lib/log";
import type { NotificationType } from "@/types";

export function adminRecipientQuery() {
  return { role: { $in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" };
}

export function complaintNotificationUrl(orderId?: string | null) {
  return orderId ? `/complaints/${orderId}` : "/notifications";
}

export function notificationDedupeWindowMs() {
  return 5000;
}

export class NotificationService {
  static async create(params: {
    recipientUserId: string;
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    orderId?: string;
    requestTypeId?: string;
    botId?: string;
    eventKey?: string;
  }) {
    const db = await getDb();
    const eventKey =
      params.eventKey ||
      [params.type, params.recipientUserId, params.orderId ?? params.entityId ?? "", params.title].join(":");
    const existing = await db.collection(collections.notifications).findOne({
      recipientUserId: params.recipientUserId,
      type: params.type,
      orderId: params.orderId ?? null,
      eventKey,
      createdAt: { $gt: new Date(Date.now() - notificationDedupeWindowMs()) },
    });
    if (existing) {
      logJson("info", "notifications", "deduped", {
        notificationId: String(existing._id),
        type: params.type,
        recipientUserId: params.recipientUserId,
      });
      return String(existing._id);
    }
    const createdAt = new Date();
    const result = await db.collection(collections.notifications).insertOne({
      ...params,
      eventKey,
      read: false,
      readAt: null,
      createdAt,
    });
    const notificationId = String(result.insertedId);
    await db.collection(collections.notificationOutbox).insertOne({
      notificationId,
      status: "PENDING",
      attempts: 0,
      createdAt,
      updatedAt: createdAt,
    });
    logJson("info", "notifications", "created", {
      notificationId,
      type: params.type,
      recipientUserId: params.recipientUserId,
      orderId: params.orderId ?? null,
    });
    void WebPushService.deliverNotification(notificationId).catch((err) => {
      logJson("error", "notifications", "push_enqueue_failed", {
        notificationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return notificationId;
  }

  static async notifyAdmins(params: Omit<Parameters<typeof this.create>[0], "recipientUserId">) {
    const db = await getDb();
    const admins = await db
      .collection(collections.users)
      .find(adminRecipientQuery(), { projection: { _id: 1 } })
      .toArray();
    if (!admins.length) {
      logJson("warn", "notifications", "no_admin_recipients", { type: params.type });
    }
    const ids: string[] = [];
    for (const admin of admins) {
      ids.push(await this.create({ ...params, recipientUserId: String(admin._id) }));
    }
    return ids;
  }

  static async notifyAdminsNewOrder(params: {
    orderId: string;
    orderNumber: string;
    requestTypeId: string;
    botId: string;
    telegramUsername?: string;
  }) {
    return this.notifyAdminsNewComplaint(params);
  }

  static async notifyAdminsNewComplaint(params: {
    orderId: string;
    orderNumber: string;
    requestTypeId: string;
    botId: string;
    telegramUsername?: string;
  }) {
    const db = await getDb();
    const request = await db.collection(collections.requestTypes).findOne({
      _id: new ObjectId(params.requestTypeId),
    });
    const userLine = params.telegramUsername ? `@${params.telegramUsername}` : "مستخدم Telegram";
    return this.notifyAdmins({
      type: "NEW_COMPLAINT",
      title: "🆕 شكوى جديدة",
      message: `تم استلام شكوى جديدة:\n#${params.orderNumber}\nنوع الشكوى: ${request?.name ?? ""}\nالمستخدم:\n${userLine}`,
      entityType: "complaint",
      entityId: params.orderId,
      orderId: params.orderId,
      requestTypeId: params.requestTypeId,
      botId: params.botId,
      eventKey: `NEW_COMPLAINT:${params.orderId}`,
    });
  }

  static async unreadCount(userId: string) {
    const db = await getDb();
    return db.collection(collections.notifications).countDocuments({
      recipientUserId: userId,
      read: false,
    });
  }

  static async list(userId: string, unreadOnly = false, page = 1, pageSize = 20) {
    const db = await getDb();
    const query: Record<string, unknown> = { recipientUserId: userId };
    if (unreadOnly) query.read = false;
    const [items, total] = await Promise.all([
      db
        .collection(collections.notifications)
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      db.collection(collections.notifications).countDocuments(query),
    ]);
    return { items, total, unread: await this.unreadCount(userId) };
  }

  static async listSince(userId: string, since: Date, limit = 20) {
    const db = await getDb();
    return db
      .collection(collections.notifications)
      .find({
        recipientUserId: userId,
        createdAt: { $gt: since },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  static async getOwned(id: string, userId: string) {
    if (!ObjectId.isValid(id)) return null;
    const db = await getDb();
    return db.collection(collections.notifications).findOne({
      _id: new ObjectId(id),
      recipientUserId: userId,
    });
  }

  static serialize(doc: Record<string, unknown>) {
    return {
      id: String(doc._id),
      title: String(doc.title ?? ""),
      message: String(doc.message ?? ""),
      type: String(doc.type ?? ""),
      read: Boolean(doc.read),
      createdAt: doc.createdAt,
      orderId: doc.orderId ? String(doc.orderId) : undefined,
      requestTypeId: doc.requestTypeId ? String(doc.requestTypeId) : undefined,
      entityType: doc.entityType ? String(doc.entityType) : undefined,
      entityId: doc.entityId ? String(doc.entityId) : undefined,
      url: complaintNotificationUrl(doc.orderId ? String(doc.orderId) : null),
    };
  }

  static async markRead(id: string, userId: string) {
    const db = await getDb();
    await db.collection(collections.notifications).updateOne(
      { _id: new ObjectId(id), recipientUserId: userId },
      { $set: { read: true, readAt: new Date() } },
    );
  }

  static async markAllRead(userId: string) {
    const db = await getDb();
    await db.collection(collections.notifications).updateMany(
      { recipientUserId: userId, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
  }
}
