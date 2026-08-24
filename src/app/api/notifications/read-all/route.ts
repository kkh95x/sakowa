import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { NotificationService } from "@/lib/notifications/notification-service";

export async function POST() {
  try {
    const user = await withAuth();
    await NotificationService.markAllRead(user.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
