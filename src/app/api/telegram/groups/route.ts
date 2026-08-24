import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { TelegramGroupService } from "@/lib/telegram/telegram-group-service";
import { z } from "zod";

export async function GET() {
  try {
    await withAuth(["ADMIN"]);
    const groups = await TelegramGroupService.list();
    return json({
      groups: groups.map((g) => TelegramGroupService.serialize(g as Record<string, unknown>)),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

const createSchema = z.object({
  title: z.string().min(1),
  chatId: z.union([z.string().min(1), z.number()]),
  messageThreadId: z.union([z.string(), z.number(), z.null()]).optional(),
  type: z.enum(["group", "supergroup", "channel"]).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    const body = createSchema.parse(await req.json());
    const id = await TelegramGroupService.create({ ...body, actorId: user.id });
    return json({ id });
  } catch (err) {
    return errorToResponse(err);
  }
}
