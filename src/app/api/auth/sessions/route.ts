import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { getSessionToken } from "@/lib/auth/session";
import { sha256 } from "@/lib/security/crypto";

export async function GET() {
  try {
    const user = await withAuth();
    const db = await getDb();
    const token = await getSessionToken();
    const currentHash = token ? sha256(token) : null;
    const sessions = await db
      .collection(collections.sessions)
      .find({ userId: user.id, revokedAt: null })
      .sort({ lastSeenAt: -1 })
      .toArray();
    return json({
      sessions: sessions.map((s) => ({
        id: String(s._id),
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.tokenHash === currentHash,
      })),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await withAuth();
    const { id, allOthers } = await req.json();
    const db = await getDb();
    const token = await getSessionToken();
    const currentHash = token ? sha256(token) : "";
    if (allOthers) {
      await db.collection(collections.sessions).updateMany(
        { userId: user.id, tokenHash: { $ne: currentHash }, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    } else if (id) {
      await db.collection(collections.sessions).updateOne(
        { _id: new ObjectId(id), userId: user.id },
        { $set: { revokedAt: new Date() } },
      );
    }
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
