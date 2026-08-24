import { z } from "zod";
import { AuthService } from "@/lib/auth/auth-service";
import { errorToResponse, json } from "@/lib/api/http";
import { headers } from "next/headers";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const h = await headers();
    const result = await AuthService.login({
      ...body,
      ip: h.get("x-forwarded-for") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });
    return json(result);
  } catch (err) {
    return errorToResponse(err);
  }
}
