import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  message: z.string().max(4000).optional().default(""),
  fileId: z.string().optional(),
}).refine((v) => Boolean(v.message?.trim()) || Boolean(v.fileId), {
  message: "MESSAGE_OR_FILE_REQUIRED",
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    await OrderService.sendUserMessage({
      orderId: id,
      actorId: user.id,
      message: body.message?.trim() || "",
      fileId: body.fileId,
    });
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
