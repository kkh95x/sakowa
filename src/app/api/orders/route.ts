import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";
import { OrderService } from "@/lib/orders/order-service";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { TelegramService } from "@/lib/telegram/telegram-service";
import type { OrderFilter, OrderStatus, RequestField } from "@/types";
import { z } from "zod";

async function complainantPhotos(items: Record<string, unknown>[]) {
  const photos = new Map<number, string>();
  const ids = [...new Set(items.map((item) => Number(item.telegramUserId)).filter((id) => Number.isFinite(id)))];
  if (!ids.length) return photos;
  const db = await getDb();
  const users = await db
    .collection(collections.telegramUsers)
    .find({ telegramUserId: { $in: [...ids, ...ids.map(String)] } })
    .project({ telegramUserId: 1, photoFileId: 1 })
    .toArray();
  for (const user of users) {
    const id = Number(user.telegramUserId);
    if (Number.isFinite(id) && user.photoFileId) photos.set(id, String(user.photoFileId));
  }
  const missing = new Map<number, string>();
  for (const item of items) {
    const id = Number(item.telegramUserId);
    if (!Number.isFinite(id) || photos.has(id) || missing.has(id) || !item.botId) continue;
    missing.set(id, String(item.botId));
  }
  await Promise.all(
    [...missing].map(async ([id, botId]) => {
      const fileId = await TelegramService.syncUserProfilePhoto(botId, id).catch(() => null);
      if (fileId) photos.set(id, fileId);
    }),
  );
  return photos;
}

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
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const filtersRaw = url.searchParams.get("filters");
    const filters = filtersRaw ? (JSON.parse(filtersRaw) as OrderFilter[]) : [];
    z.array(filterSchema).parse(filters);
    const rt = await RequestTypeService.get(requestTypeId);
    const fields = ((rt?.fields as { name: string; type: RequestField["type"] }[]) ?? []).map((field) => ({
      name: field.name,
      type: field.type,
    }));
    const result = await OrderService.list({
      requestTypeId,
      status,
      search,
      page,
      pageSize,
      filters,
      fields,
    });
    const items = result.items.map((o) =>
      OrderService.sanitizeOrder({ ...o, id: String(o._id) }, (rt?.fields as never) ?? []),
    );
    const photoByUser = await complainantPhotos(items);
    const withPhotos = items.map((item) => {
      const fileId = photoByUser.get(Number(item.telegramUserId));
      return { ...item, photoUrl: fileId ? `/api/files/${fileId}` : null };
    });
    const counts = await OrderService.countsByStatus(requestTypeId);
    return json({ ...result, items: withPhotos, counts });
  } catch (err) {
    return errorToResponse(err);
  }
}
