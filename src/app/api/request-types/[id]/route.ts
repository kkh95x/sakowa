import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

function serializeRequestType(item: Record<string, unknown>) {
  const id = String(item._id);
  return {
    id,
    name: item.name,
    slug: String(item.slug || `svc-${id}`),
    botId: item.botId,
    active: Boolean(item.active),
    fields: item.fields ?? [],
    telegramGroupId: item.telegramGroupId ?? null,
    description: item.description ?? "",
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth();
    const { id } = await ctx.params;
    const item = await RequestTypeService.getBySlug(id);
    if (!item || item.archivedAt) return json({ error: "NOT_FOUND" }, 404);
    return json({ requestType: serializeRequestType(item as Record<string, unknown>) });
  } catch (err) {
    return errorToResponse(err);
  }
}

const schema = z.object({
  active: z.boolean().optional(),
  archive: z.boolean().optional(),
  telegramGroupId: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  botId: z.string().min(1).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    if (typeof body.active === "boolean") await RequestTypeService.setActive(id, body.active, user.id);
    if (body.archive) await RequestTypeService.archive(id, user.id);
    if (body.telegramGroupId !== undefined) {
      await RequestTypeService.linkGroup(id, body.telegramGroupId, user.id);
    }
    if (body.name !== undefined || body.description !== undefined || body.botId !== undefined) {
      await RequestTypeService.update(id, {
        name: body.name,
        description: body.description,
        botId: body.botId,
        actorId: user.id,
      });
    }
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
