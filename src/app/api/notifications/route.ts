import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { NotificationService } from "@/lib/notifications/notification-service";

export async function GET(req: Request) {
  try {
    const user = await withAuth();
    const url = new URL(req.url);
    const unread = url.searchParams.get("unread") === "1";
    const page = Number(url.searchParams.get("page") ?? 1);
    const result = await NotificationService.list(user.id, unread, page);
    return json({
      ...result,
      items: result.items.map((n) => ({ ...n, id: String(n._id) })),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
