import { argon2id, argon2Verify } from "hash-wasm";
import { randomBytes } from "crypto";
import { collections, getDb } from "@/lib/db/client";
import { sha256 } from "@/lib/security/crypto";

const POLICY = {
  minLength: 10,
  history: 5,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < POLICY.minLength) {
    return `كلمة المرور يجب أن تكون ${POLICY.minLength} أحرف على الأقل`;
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "كلمة المرور يجب أن تحتوي أحرفاً كبيرة وصغيرة ورقماً";
  }
  return null;
}

export async function assertPasswordNotReused(userId: string, password: string) {
  const db = await getDb();
  const history = await db
    .collection(collections.passwordHistory)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(POLICY.history)
    .toArray();
  for (const row of history) {
    if (await verifyPassword(row.hash as string, password)) {
      throw new Error("لا يمكن إعادة استخدام كلمة مرور سابقة");
    }
  }
}

export async function storePasswordHistory(userId: string, hash: string) {
  const db = await getDb();
  await db.collection(collections.passwordHistory).insertOne({
    userId,
    hash,
    createdAt: new Date(),
  });
}

export function hashToken(token: string) {
  return sha256(token);
}
