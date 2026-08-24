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
      .find({ entityId: id, category: "BOTS" })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return json({ logs });
  } catch (err) {
    return errorToResponse(err);
  }
}
