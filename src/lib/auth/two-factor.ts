import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { encrypt, decrypt, sha256, randomToken } from "@/lib/security/crypto";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { audit } from "@/lib/audit/audit";

const issuer = process.env.TOTP_ISSUER ?? "Shakowa";

function totp(secretBase32: string) {
  return new TOTP({
    issuer,
    label: issuer,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export class TwoFactorService {
  static generateSecret() {
    const secret = new Secret({ size: 20 });
    return secret.base32;
  }

  static async startSetup(userId: string, username: string) {
    const secret = this.generateSecret();
    const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    const db = await getDb();
    await db.collection(collections.users).updateOne(
      { _id: new ObjectId(userId) },
      { $set: { twoFactorPendingSecretEncrypted: encrypt(secret), updatedAt: new Date() } },
    );
    await audit({ actorUserId: userId, category: "SECURITY", action: "2FA_SETUP_STARTED" });
    return { secret, qrDataUrl, uri: otpauth };
  }

  static verifyCode(secret: string, code: string) {
    const delta = totp(secret).validate({ token: code.replace(/\s/g, ""), window: 1 });
    return delta !== null;
  }

  static async enable(userId: string, code: string) {
    const db = await getDb();
    const user = await db.collection(collections.users).findOne({ _id: new ObjectId(userId) });
    if (!user?.twoFactorPendingSecretEncrypted) throw new Error("NO_PENDING_2FA");
    const secret = decrypt(user.twoFactorPendingSecretEncrypted);
    if (!this.verifyCode(secret, code)) {
      await audit({ actorUserId: userId, category: "SECURITY", action: "2FA_VERIFICATION_FAILED" });
      throw new Error("INVALID_TOTP");
    }
    const codes = Array.from({ length: 8 }, () =>
      `${randomToken(2).slice(0, 4).toUpperCase()}-${randomToken(2).slice(0, 4).toUpperCase()}`,
    );
    await db.collection(collections.twoFactorRecoveryCodes).deleteMany({ userId });
    await db.collection(collections.twoFactorRecoveryCodes).insertMany(
      codes.map((codePlain) => ({
        userId,
        codeHash: sha256(codePlain.replace("-", "").toUpperCase()),
        usedAt: null,
        createdAt: new Date(),
      })),
    );
    await db.collection(collections.users).updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecretEncrypted: encrypt(secret),
          twoFactorEnabledAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { twoFactorPendingSecretEncrypted: "" },
      },
    );
    await audit({
      actorUserId: userId,
      category: "SECURITY",
      action: "2FA_ENABLED",
      before: { twoFactorEnabled: false },
      after: { twoFactorEnabled: true },
    });
    return codes;
  }

  static async verifyLogin(userId: string, code: string) {
    const db = await getDb();
    const user = await db.collection(collections.users).findOne({ _id: new ObjectId(userId) });
    if (!user?.twoFactorEnabled || !user.twoFactorSecretEncrypted) return false;
    const secret = decrypt(user.twoFactorSecretEncrypted);
    const ok = this.verifyCode(secret, code);
    if (ok) return true;
    const normalized = code.replace(/[-\s]/g, "").toUpperCase();
    const recovery = await db.collection(collections.twoFactorRecoveryCodes).findOne({
      userId,
      codeHash: sha256(normalized),
      usedAt: null,
    });
    if (!recovery) {
      await audit({ actorUserId: userId, category: "SECURITY", action: "2FA_VERIFICATION_FAILED" });
      return false;
    }
    await db.collection(collections.twoFactorRecoveryCodes).updateOne(
      { _id: recovery._id },
      { $set: { usedAt: new Date() } },
    );
    await audit({ actorUserId: userId, category: "SECURITY", action: "RECOVERY_CODE_USED" });
    return true;
  }

  static async disable(userId: string) {
    const db = await getDb();
    await db.collection(collections.users).updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { twoFactorEnabled: false, updatedAt: new Date() },
        $unset: { twoFactorSecretEncrypted: "", twoFactorPendingSecretEncrypted: "" },
      },
    );
    await db.collection(collections.twoFactorRecoveryCodes).deleteMany({ userId });
    await audit({
      actorUserId: userId,
      category: "SECURITY",
      action: "2FA_DISABLED",
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false },
    });
  }
}
