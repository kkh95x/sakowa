import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { collections, getDb } from "@/lib/db/client";
import { TelegramGroupService } from "@/lib/telegram/telegram-group-service";
import { ObjectId } from "mongodb";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const db = await getDb();
    const group = await db.collection(collections.telegramGroups).findOne({ _id: new ObjectId(id) });
    if (!group) return json({ error: "NOT_FOUND" }, 404);
    return json({ group: TelegramGroupService.serialize(group as Record<string, unknown>) });
  } catch (err) {
    return errorToResponse(err);
  }
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  chatId: z.union([z.string().min(1), z.number()]).optional(),
  messageThreadId: z.union([z.string(), z.number(), z.null()]).optional(),
  type: z.enum(["group", "supergroup", "channel"]).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    await TelegramGroupService.update(id, { ...body, actorId: user.id });
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    await TelegramGroupService.remove(id, user.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
