import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";
import { ObjectId } from "mongodb";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const db = await getDb();
    const sessions = await db
      .collection(collections.sessions)
      .find({ userId: id, revokedAt: null })
      .toArray();
    return json({
      sessions: sessions.map((s) => ({
        id: String(s._id),
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
      })),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await withAuth(["SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const { sessionId, all } = await req.json();
    const db = await getDb();
    if (all) {
      await db.collection(collections.sessions).updateMany(
        { userId: id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    } else if (sessionId) {
      await db.collection(collections.sessions).updateOne(
        { _id: new ObjectId(sessionId), userId: id },
        { $set: { revokedAt: new Date() } },
      );
    }
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
