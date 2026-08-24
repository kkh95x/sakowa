import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { NotificationService } from "@/lib/notifications/notification-service";
import { collections, getDb } from "@/lib/db/client";
import { ObjectId } from "mongodb";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth();
    const { id } = await ctx.params;
    await NotificationService.markRead(id, user.id);
    const db = await getDb();
    const n = await db.collection(collections.notifications).findOne({
      _id: new ObjectId(id),
      recipientUserId: user.id,
    });
    return json({ ok: true, notification: n ? { ...n, id: String(n._id) } : null });
  } catch (err) {
    return errorToResponse(err);
  }
}
