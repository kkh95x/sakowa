import { ObjectId } from "mongodb";
import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { collections, getDb } from "@/lib/db/client";
import type { OrderStatus, RequestField } from "@/types";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES: OrderStatus[] = [
  "PENDING",
  "REVIEWING",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
  "COMPLETED",
  "ARCHIVED",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const order = await OrderService.get(id);
    if (!order) throw new Error("NOT_FOUND");

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "PENDING") as OrderStatus;
    const status = STATUSES.includes(statusParam) ? statusParam : "PENDING";
    const telegramUserId = Number(order.telegramUserId);
    const requestTypeId = url.searchParams.get("requestTypeId") || undefined;
    const serviceFilter =
      requestTypeId && requestTypeId !== "all" ? requestTypeId : undefined;

    const [counts, listed, services] = await Promise.all([
      OrderService.countsByTelegramUser(telegramUserId, { requestTypeId: serviceFilter }),
      OrderService.listByTelegramUser({
        telegramUserId,
        status,
        requestTypeId: serviceFilter,
        pageSize: 50,
      }),
      OrderService.listUserServices(telegramUserId),
    ]);

    const typeIds = [
      ...new Set(
        listed.items
          .map((row) => String(row.requestTypeId ?? ""))
          .filter((value) => ObjectId.isValid(value) && String(new ObjectId(value)) === value),
      ),
    ];
    const db = await getDb();
    const types = typeIds.length
      ? await db
          .collection(collections.requestTypes)
          .find({ _id: { $in: typeIds.map((value) => new ObjectId(value)) } })
          .toArray()
      : [];
    const typeMap = new Map(types.map((row) => [String(row._id), row]));

    const items = listed.items.map((row) => {
      const sanitized = OrderService.sanitizeOrder(
        { ...row, id: String(row._id) },
        [],
      );
      const rt = typeMap.get(String(row.requestTypeId));
      const fields = (rt?.fields as RequestField[]) ?? [];
      return {
        id: String(row._id),
        orderNumber: String(row.orderNumber ?? ""),
        status: String(row.status ?? status),
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
        requestTypeId: String(row.requestTypeId ?? ""),
        requestTypeName: String(rt?.name ?? services.find((s) => s.id === String(row.requestTypeId))?.name ?? ""),
        summary: OrderService.summarizeSubmittedAnswers(sanitized, fields),
      };
    });

    const res = json({ counts, items, status, services });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    return errorToResponse(err);
  }
}
