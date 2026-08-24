import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { WebPushService } from "@/lib/notifications/web-push-service";
import type { NotificationType } from "@/types";
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
  }) {
    const db = await getDb();
    const existing = await db.collection(collections.notifications).findOne({
      recipientUserId: params.recipientUserId,
      type: params.type,
      orderId: params.orderId ?? null,
      createdAt: { $gt: new Date(Date.now() - 5000) },
    });
    if (existing) return String(existing._id);
    const result = await db.collection(collections.notifications).insertOne({
      ...params,
      read: false,
      readAt: null,
      createdAt: new Date(),
    });
    await db.collection(collections.notificationOutbox).insertOne({
      notificationId: String(result.insertedId),
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
    });
    void WebPushService.deliverNotification(String(result.insertedId)).catch(() => undefined);
    return String(result.insertedId);
  }

  static async notifyAdmins(params: Omit<Parameters<typeof this.create>[0], "recipientUserId">) {
    const db = await getDb();
    const admins = await db
      .collection(collections.users)
      .find({ role: "ADMIN", status: "ACTIVE" }, { projection: { _id: 1 } })
      .toArray();
    for (const admin of admins) {
      await this.create({ ...params, recipientUserId: String(admin._id) });
    }
  }

  static async notifyAdminsNewOrder(params: {
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
    await this.notifyAdmins({
      type: "NEW_ORDER",
      title: "🆕 طلب جديد",
      message: `تم استلام طلب جديد:\n#${params.orderNumber}\nالخدمة: ${request?.name ?? ""}\nالمستخدم:\n${userLine}`,
      entityType: "order",
      entityId: params.orderId,
      orderId: params.orderId,
      requestTypeId: params.requestTypeId,
      botId: params.botId,
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
