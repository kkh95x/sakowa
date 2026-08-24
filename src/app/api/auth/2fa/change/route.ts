import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { TwoFactorService } from "@/lib/auth/two-factor";
import { collections, getDb } from "@/lib/db/client";
import { decrypt } from "@/lib/security/crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { audit } from "@/lib/audit/audit";

const schema = z.object({ code: z.string().min(6) });

export async function POST(req: Request) {
  try {
    const user = await withAuth();
    const { code } = schema.parse(await req.json());
    const db = await getDb();
    const doc = await db.collection(collections.users).findOne({ _id: new ObjectId(user.id) });
    if (!doc?.twoFactorSecretEncrypted) throw new Error("NO_2FA");
    if (!TwoFactorService.verifyCode(decrypt(doc.twoFactorSecretEncrypted), code)) {
      throw new Error("INVALID_TOTP");
    }
    const result = await TwoFactorService.startSetup(user.id, user.username);
    await audit({ actorUserId: user.id, category: "SECURITY", action: "2FA_SECRET_CHANGED" });
    return json(result);
  } catch (err) {
    return errorToResponse(err);
  }
}
