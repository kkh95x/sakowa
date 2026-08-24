import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import type { OrderStatus } from "@/types";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(["PENDING", "REVIEWING", "COMPLETED", "REJECTED", "ARCHIVED"]),
  message: z.string().optional(),
  attachmentFileId: z.string().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    await OrderService.changeStatus({
      orderId: id,
      next: body.status as OrderStatus,
      actorId: user.id,
      message: body.message,
      attachmentFileId: body.attachmentFileId,
    });
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
