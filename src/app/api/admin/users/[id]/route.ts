import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { UserService } from "@/lib/users/user-service";
import { collections, getDb } from "@/lib/db/client";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const actor = await withAuth(["SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const body = z
      .object({
        status: z.enum(["ACTIVE", "DISABLED", "BLOCKED"]).optional(),
        password: z.string().min(10).optional(),
      })
      .parse(await req.json());
    if (body.status) await UserService.updateStatus(id, body.status, actor.id);
    if (body.password) await UserService.resetPassword(id, body.password, actor.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const db = await getDb();
    const user = await db.collection(collections.users).findOne(
      { _id: new (await import("mongodb")).ObjectId(id) },
      { projection: { passwordHash: 0, twoFactorSecretEncrypted: 0 } },
    );
    return json({ user: user ? { ...user, id: String(user._id) } : null });
  } catch (err) {
    return errorToResponse(err);
  }
}
