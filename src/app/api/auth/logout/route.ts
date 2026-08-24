import { AuthService } from "@/lib/auth/auth-service";
import { json } from "@/lib/api/http";

export async function POST() {
  await AuthService.logout();
  return json({ ok: true });
}
