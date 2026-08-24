import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";

export async function GET(req: Request) {
  try {
    const user = await withAuth();
    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? 1);
    const db = await getDb();
    const query: Record<string, unknown> = {};
    if (user.role !== "SUPER_ADMIN") query.actorUserId = user.id;
    if (category) query.category = category;
    if (search) query.action = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const items = await db
      .collection(collections.auditLogs)
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 30)
      .limit(30)
      .toArray();
    return json({ logs: items.map((l) => ({ ...l, id: String(l._id) })) });
  } catch (err) {
    return errorToResponse(err);
  }
}
