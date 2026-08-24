import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { TwoFactorService } from "@/lib/auth/two-factor";
import { collections, getDb } from "@/lib/db/client";
import { decrypt } from "@/lib/security/crypto";
import { verifyPassword } from "@/lib/auth/password";
import { ObjectId } from "mongodb";
import { z } from "zod";

const schema = z.object({
  password: z.string().min(1),
  code: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth();
    const body = schema.parse(await req.json());
    const db = await getDb();
    const doc = await db.collection(collections.users).findOne({ _id: new ObjectId(user.id) });
    if (!doc || !(await verifyPassword(doc.passwordHash, body.password))) {
      throw new Error("INVALID_CURRENT_PASSWORD");
    }
    if (!doc.twoFactorSecretEncrypted || !TwoFactorService.verifyCode(decrypt(doc.twoFactorSecretEncrypted), body.code)) {
      throw new Error("INVALID_TOTP");
    }
    await TwoFactorService.disable(user.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
