import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

export const runtime = "nodejs";

const editSchema = z.object({
  text: z.string().max(4096),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id, messageId } = await ctx.params;
    const body = editSchema.parse(await req.json());
    const result = await OrderService.editUserMessage({
      orderId: id,
      messageId,
      actorId: user.id,
      text: body.text,
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id, messageId } = await ctx.params;
    const result = await OrderService.deleteUserMessage({
      orderId: id,
      messageId,
      actorId: user.id,
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return errorToResponse(err);
  }
}
