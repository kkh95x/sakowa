import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { randomToken, sha256 } from "@/lib/security/crypto";
import type { SessionUser } from "@/types";

const COOKIE = "bothub_session";

export async function createSession(params: {
  userId: string;
  ip?: string;
  userAgent?: string;
}) {
  const token = randomToken(32);
  const db = await getDb();
  await db.collection(collections.sessions).insertOne({
    userId: params.userId,
    tokenHash: sha256(token),
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    revokedAt: null,
  });
  return token;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionToken() {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const db = await getDb();
  const session = await db.collection(collections.sessions).findOne({
    tokenHash: sha256(token),
    revokedAt: null,
  });
  if (!session) return null;
  const user = await db.collection(collections.users).findOne({
    _id: new ObjectId(String(session.userId)),
  });
  if (!user || user.status !== "ACTIVE") return null;
  await db.collection(collections.sessions).updateOne(
    { _id: session._id },
    { $set: { lastSeenAt: new Date() } },
  );
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    throw err;
  }
  return user;
}

export async function requireRole(roles: SessionUser["role"][]) {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN" && roles.includes("ADMIN")) return user;
  if (!roles.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function revokeSessionByToken(token: string) {
  const db = await getDb();
  await db.collection(collections.sessions).updateOne(
    { tokenHash: sha256(token) },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllUserSessions(userId: string, exceptTokenHash?: string) {
  const db = await getDb();
  await db.collection(collections.sessions).updateMany(
    {
      userId,
      revokedAt: null,
      ...(exceptTokenHash ? { tokenHash: { $ne: exceptTokenHash } } : {}),
    },
    { $set: { revokedAt: new Date() } },
  );
}
