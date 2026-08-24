import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { hashPassword, verifyPassword, validatePasswordPolicy, assertPasswordNotReused, storePasswordHistory } from "@/lib/auth/password";
import { createSession, setSessionCookie, getSessionToken, revokeSessionByToken, revokeAllUserSessions } from "@/lib/auth/session";
import { TwoFactorService } from "@/lib/auth/two-factor";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/audit/audit";
import { hashToken } from "@/lib/auth/password";

export class AuthService {
  static async login(params: {
    username: string;
    password: string;
    totp?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const key = `login:${params.ip ?? "x"}:${params.username}`;
    if (!rateLimit(key, 8, 10 * 60 * 1000)) {
      throw new Error("RATE_LIMITED");
    }
    const db = await getDb();
    const user = await db.collection(collections.users).findOne({
      username: params.username.trim(),
    });
    if (!user || !(await verifyPassword(user.passwordHash, params.password))) {
      await audit({
        category: "SECURITY",
        action: "LOGIN_FAILED",
        ip: params.ip,
        metadata: { username: params.username },
      });
      throw new Error("INVALID_CREDENTIALS");
    }
    if (user.status !== "ACTIVE") throw new Error("ACCOUNT_DISABLED");
    if (user.twoFactorEnabled) {
      if (!params.totp) {
        return { requiresTwoFactor: true as const, userId: String(user._id) };
      }
      const ok = await TwoFactorService.verifyLogin(String(user._id), params.totp);
      if (!ok) throw new Error("INVALID_TOTP");
    }
    const token = await createSession({
      userId: String(user._id),
      ip: params.ip,
      userAgent: params.userAgent,
    });
    await setSessionCookie(token);
    await audit({
      actorUserId: String(user._id),
      category: "AUTH",
      action: "LOGIN_SUCCESS",
      ip: params.ip,
    });
    return {
      requiresTwoFactor: false as const,
      user: {
        id: String(user._id),
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
      },
    };
  }

  static async logout() {
    const token = await getSessionToken();
    if (token) await revokeSessionByToken(token);
    const { clearSessionCookie } = await import("@/lib/auth/session");
    await clearSessionCookie();
  }

  static async changePassword(userId: string, current: string, next: string) {
    const policy = validatePasswordPolicy(next);
    if (policy) throw new Error(policy);
    const db = await getDb();
    const user = await db.collection(collections.users).findOne({ _id: new ObjectId(userId) });
    if (!user || !(await verifyPassword(user.passwordHash, current))) {
      throw new Error("INVALID_CURRENT_PASSWORD");
    }
    await assertPasswordNotReused(userId, next);
    const hash = await hashPassword(next);
    await db.collection(collections.users).updateOne(
      { _id: user._id },
      { $set: { passwordHash: hash, updatedAt: new Date() } },
    );
    await storePasswordHistory(userId, hash);
    const token = await getSessionToken();
    await revokeAllUserSessions(userId, token ? hashToken(token) : undefined);
    await audit({ actorUserId: userId, category: "SECURITY", action: "PASSWORD_CHANGED" });
  }
}
