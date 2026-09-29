import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { UserService } from "@/lib/users/user-service";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const actor = await withAuth(["SUPER_ADMIN"]);
    const { id } = await ctx.params;
    await UserService.clearTwoFactor(id, actor.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
