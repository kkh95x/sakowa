import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService, serializeBot } from "@/lib/bots/bot-service";
import { z } from "zod";

export async function GET() {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
    const bots = await BotService.list();
    return json({
      bots: bots.map((b) => serializeBot(b as Record<string, unknown>)),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

const schema = z.object({ name: z.string().min(1), token: z.string().min(10) });

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    const body = schema.parse(await req.json());
    const id = await BotService.create({ ...body, actorId: user.id });
    return json({ id });
  } catch (err) {
    return errorToResponse(err);
  }
}
