import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { collections, getDb } from "@/lib/db/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const { id } = await ctx.params;
    const order = await OrderService.get(id);
    if (!order) return json({ error: "NOT_FOUND" }, 404);
    const rt = await RequestTypeService.get(String(order.requestTypeId));
    const db = await getDb();
    const history = await db
      .collection(collections.orderStatusHistory)
      .find({ orderId: id })
      .sort({ createdAt: 1 })
      .toArray();
    return json({
      order: OrderService.sanitizeOrder({ ...order, id: String(order._id) }, (rt?.fields as never) ?? []),
      history,
      requestType: rt ? { id: String(rt._id), name: rt.name, slug: rt.slug, fields: rt.fields } : null,
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
