import { json } from "@/lib/api/http";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/notifications/web-push-service";

export async function GET() {
  const publicKey = getVapidPublicKey();
  return json({ publicKey, enabled: isWebPushConfigured() && Boolean(publicKey) });
}
