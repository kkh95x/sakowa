import { errorToResponse, json, withAuth } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    return json({ id });
  } catch (err) {
    return errorToResponse(err);
  }
}
