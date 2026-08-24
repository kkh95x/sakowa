import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import type { OrderFilter, OrderStatus } from "@/types";
import { z } from "zod";

const filterSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.unknown().optional(),
  valueTo: z.unknown().optional(),
});

export async function GET(req: Request) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const url = new URL(req.url);
    const requestTypeId = url.searchParams.get("requestTypeId") ?? "";
    const status = (url.searchParams.get("status") ?? "PENDING") as OrderStatus;
    const search = url.searchParams.get("search") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? 1);
    const filtersRaw = url.searchParams.get("filters");
    const filters = filtersRaw ? (JSON.parse(filtersRaw) as OrderFilter[]) : [];
    z.array(filterSchema).parse(filters);
    const rt = await RequestTypeService.get(requestTypeId);
    const result = await OrderService.list({ requestTypeId, status, search, page, filters });
    const items = result.items.map((o) =>
      OrderService.sanitizeOrder({ ...o, id: String(o._id) }, (rt?.fields as never) ?? []),
    );
    const counts = await OrderService.countsByStatus(requestTypeId);
    return json({ ...result, items, counts });
  } catch (err) {
    return errorToResponse(err);
  }
}
