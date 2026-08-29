import { hashPassword, storePasswordHistory } from "@/lib/auth/password";
import { collections, getDb } from "@/lib/db/client";
import type { Role } from "@/types";

export async function upsertSeedUser(
  username: string,
  displayName: string,
  password: string,
  role: Role,
): Promise<{ id: string; created: boolean }> {
  const db = await getDb();
  const existing = await db.collection(collections.users).findOne({ username });
  if (existing) {
    return { id: String(existing._id), created: false };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const result = await db.collection(collections.users).insertOne({
    username,
    displayName,
    passwordHash,
    role,
    status: "ACTIVE",
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
  await storePasswordHistory(String(result.insertedId), passwordHash);
  return { id: String(result.insertedId), created: true };
}

export type EnsureSuperAdminResult =
  | { created: true; username: string }
  | { created: false; skipped?: boolean; reason?: string };

export async function ensureSuperAdmin(): Promise<EnsureSuperAdminResult> {
  const db = await getDb();
  const existing = await db.collection(collections.users).findOne({ role: "SUPER_ADMIN" });
  if (existing) {
    return { created: false };
  }

  const username = (process.env.SEED_SUPER_ADMIN_USERNAME ?? "superadmin").trim();
  const password =
    process.env.SEED_SUPER_ADMIN_PASSWORD?.trim() ??
    (process.env.NODE_ENV !== "production" ? "ChangeMe!Super1" : undefined);

  if (!password) {
    return {
      created: false,
      skipped: true,
      reason: "SEED_SUPER_ADMIN_PASSWORD is not set",
    };
  }

  const usernameTaken = await db.collection(collections.users).findOne({ username });
  if (usernameTaken) {
    return {
      created: false,
      skipped: true,
      reason: `username "${username}" already exists with a different role`,
    };
  }

  await upsertSeedUser(username, "Super Admin", password, "SUPER_ADMIN");
  return { created: true, username };
}
