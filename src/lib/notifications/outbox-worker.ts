import { collections, getDb } from "@/lib/db/client";
import { WebPushService } from "@/lib/notifications/web-push-service";
import { logJson } from "@/lib/log";

const MAX_ATTEMPTS = 8;

export async function retryPendingNotificationOutbox() {
  const db = await getDb();
  const pending = await db
    .collection(collections.notificationOutbox)
    .find({
      status: { $in: ["PENDING", "FAILED"] },
      attempts: { $lt: MAX_ATTEMPTS },
      updatedAt: { $lte: new Date(Date.now() - 10_000) },
    })
    .sort({ createdAt: 1 })
    .limit(25)
    .toArray();

  for (const row of pending) {
    const notificationId = String(row.notificationId ?? "");
    if (!notificationId) continue;
    try {
      await WebPushService.deliverNotification(notificationId);
    } catch (err) {
      logJson("error", "notifications", "outbox_retry_failed", {
        notificationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (pending.length) {
    logJson("info", "notifications", "outbox_retry_batch", { count: pending.length });
  }
}

export function startNotificationOutboxWorker() {
  void retryPendingNotificationOutbox().catch(() => undefined);
  return setInterval(() => {
    void retryPendingNotificationOutbox().catch(() => undefined);
  }, 30_000);
}
