import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { hashPassword, validatePasswordPolicy, storePasswordHistory } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { TwoFactorService } from "@/lib/auth/two-factor";
import { audit } from "@/lib/audit/audit";
import type { Role, UserStatus } from "@/types";

export class UserService {
  static async list(role?: Role) {
    const db = await getDb();
    const filter = role ? { role } : {};
    return db
      .collection(collections.users)
      .find(filter, { projection: { passwordHash: 0, twoFactorSecretEncrypted: 0, twoFactorPendingSecretEncrypted: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
  }

  static async create(params: {
    username: string;
    displayName: string;
    password: string;
    role: Role;
    actorId: string;
  }) {
    const policy = validatePasswordPolicy(params.password);
    if (policy) throw new Error(policy);
    const db = await getDb();
    const exists = await db.collection(collections.users).findOne({ username: params.username.trim() });
    if (exists) throw new Error("USERNAME_TAKEN");
    const hash = await hashPassword(params.password);
    const now = new Date();
    const result = await db.collection(collections.users).insertOne({
      username: params.username.trim(),
      displayName: params.displayName.trim(),
      passwordHash: hash,
      role: params.role,
      status: "ACTIVE" satisfies UserStatus,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    await storePasswordHistory(String(result.insertedId), hash);
    await audit({
      actorUserId: params.actorId,
      category: "USERS",
      action: "ADMIN_CREATED",
      entityType: "user",
      entityId: String(result.insertedId),
      after: {
        id: String(result.insertedId),
        username: params.username.trim(),
        displayName: params.displayName.trim(),
        role: params.role,
        status: "ACTIVE",
      },
    });
    return String(result.insertedId);
  }

  static async updateStatus(id: string, status: UserStatus, actorId: string) {
    const db = await getDb();
    const before = await db.collection(collections.users).findOne(
      { _id: new ObjectId(id) },
      { projection: { passwordHash: 0, twoFactorSecretEncrypted: 0, twoFactorPendingSecretEncrypted: 0 } },
    );
    const updatedAt = new Date();
    await db.collection(collections.users).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt } },
    );
    if (status !== "ACTIVE") await revokeAllUserSessions(id);
    await audit({
      actorUserId: actorId,
      category: "USERS",
      action: "ADMIN_STATUS_CHANGED",
      entityId: id,
      metadata: { status },
      before,
      after: { ...before, status, updatedAt },
    });
  }

  static async resetPassword(id: string, password: string, actorId: string) {
    const policy = validatePasswordPolicy(password);
    if (policy) throw new Error(policy);
    const db = await getDb();
    const hash = await hashPassword(password);
    await db.collection(collections.users).updateOne(
      { _id: new ObjectId(id) },
      { $set: { passwordHash: hash, updatedAt: new Date() } },
    );
    await storePasswordHistory(id, hash);
    await revokeAllUserSessions(id);
    await audit({ actorUserId: actorId, category: "USERS", action: "ADMIN_PASSWORD_RESET", entityId: id });
  }

  static async clearTwoFactor(id: string, actorId: string) {
    const db = await getDb();
    const user = await db.collection(collections.users).findOne({ _id: new ObjectId(id) });
    if (!user) throw new Error("NOT_FOUND");
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    if (!user.twoFactorEnabled) throw new Error("التحقق بخطوتين غير مفعّل");
    await TwoFactorService.disable(id, actorId);
    await revokeAllUserSessions(id);
  }
}
