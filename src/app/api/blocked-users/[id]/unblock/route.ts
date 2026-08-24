import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BlockedUserService } from "@/lib/blocks/blocked-user-service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    await BlockedUserService.unblock(id, user.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
