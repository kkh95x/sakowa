import { z } from "zod";
import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { WebPushService, isWebPushConfigured } from "@/lib/notifications/web-push-service";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    if (!isWebPushConfigured()) throw new Error("PUSH_NOT_CONFIGURED");
    const body = schema.parse(await req.json());
    await WebPushService.saveSubscription(
      user.id,
      { endpoint: body.endpoint, keys: body.keys },
      req.headers.get("user-agent") ?? undefined,
    );
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
