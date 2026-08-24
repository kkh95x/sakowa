import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BlockedUserService } from "@/lib/blocks/blocked-user-service";
import { z } from "zod";

export async function GET() {
  try {
    await withAuth(["ADMIN"]);
    const items = await BlockedUserService.list();
    return json({
      blocks: items.map((b) => ({
        id: String(b._id),
        telegramUserId: b.telegramUserId,
        username: b.username,
        firstName: b.firstName,
        lastName: b.lastName,
        requestTypeId: b.requestTypeId,
        botId: b.botId,
        reason: b.reason,
        blockedAt: b.blockedAt,
      })),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

const schema = z.object({
  telegramUserId: z.number(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  botId: z.string(),
  requestTypeId: z.string(),
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    const body = schema.parse(await req.json());
    const id = await BlockedUserService.block({ ...body, actorId: user.id });
    return json({ id });
  } catch (err) {
    return errorToResponse(err);
  }
}
