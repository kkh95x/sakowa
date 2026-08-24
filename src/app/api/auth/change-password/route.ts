import { z } from "zod";
import { AuthService } from "@/lib/auth/auth-service";
import { errorToResponse, json, withAuth } from "@/lib/api/http";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth();
    const body = schema.parse(await req.json());
    await AuthService.changePassword(user.id, body.currentPassword, body.newPassword);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
