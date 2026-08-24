import webpush from "web-push";
import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { logJson } from "@/lib/log";

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@bothub.local";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null;
}

export function isWebPushConfigured() {
  return Boolean(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

export class WebPushService {
  static async saveSubscription(userId: string, subscription: PushSubscriptionRecord, userAgent?: string) {
    const db = await getDb();
    const now = new Date();
    await db.collection(collections.pushSubscriptions).updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          userAgent: userAgent ?? null,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  static async removeSubscription(userId: string, endpoint?: string) {
    const db = await getDb();
    const query: Record<string, unknown> = { userId };
    if (endpoint) query.endpoint = endpoint;
    await db.collection(collections.pushSubscriptions).deleteMany(query);
  }

  static async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string; tag?: string },
  ) {
    if (!configureWebPush()) return { sent: 0, failed: 0, skipped: true };

    const db = await getDb();
    const subs = await db.collection(collections.pushSubscriptions).find({ userId }).toArray();
    if (!subs.length) return { sent: 0, failed: 0, skipped: false };

    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/notifications",
      tag: payload.tag,
    });

    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: String(sub.endpoint),
            keys: sub.keys as { p256dh: string; auth: string },
          },
          data,
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.collection(collections.pushSubscriptions).deleteOne({ _id: sub._id });
        }
        logJson("warn", "notifications", "push_send_failed", {
          userId,
          endpoint: String(sub.endpoint).slice(0, 64),
          statusCode: statusCode ?? null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { sent, failed, skipped: false };
  }

  static async deliverNotification(notificationId: string) {
    const db = await getDb();
    const notification = await db.collection(collections.notifications).findOne({
      _id: new ObjectId(notificationId),
    });
    if (!notification) {
      await db.collection(collections.notificationOutbox).updateOne(
        { notificationId },
        { $set: { status: "FAILED", lastError: "NOT_FOUND", updatedAt: new Date() } },
      );
      return;
    }

    const url = notification.orderId ? `/orders/${notification.orderId}` : "/notifications";
    const result = await this.sendToUser(String(notification.recipientUserId), {
      title: String(notification.title),
      body: String(notification.message),
      url,
      tag: notificationId,
    });

    const status = result.skipped ? "SKIPPED" : result.sent > 0 ? "SENT" : "FAILED";
    await db.collection(collections.notificationOutbox).updateOne(
      { notificationId },
      {
        $set: {
          status,
          updatedAt: new Date(),
          lastError: status === "FAILED" ? "NO_ACTIVE_SUBSCRIPTIONS" : null,
        },
        $inc: { attempts: 1 },
      },
    );
  }
}
