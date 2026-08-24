import { z } from "zod";
import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { WebPushService } from "@/lib/notifications/web-push-service";

const schema = z.object({
  endpoint: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    const body = schema.parse(await req.json().catch(() => ({})));
    await WebPushService.removeSubscription(user.id, body.endpoint);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
