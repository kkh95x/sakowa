import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const db = await getDb();
    const logs = await db
      .collection(collections.auditLogs)
      .find({ entityId: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const history = await db
      .collection(collections.orderStatusHistory)
      .find({ orderId: id })
      .sort({ createdAt: 1 })
      .toArray();
    return json({ logs, history });
  } catch (err) {
    return errorToResponse(err);
  }
}
