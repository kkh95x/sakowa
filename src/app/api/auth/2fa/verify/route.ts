import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { TwoFactorService } from "@/lib/auth/two-factor";
import { z } from "zod";

const schema = z.object({ code: z.string().min(6) });

export async function POST(req: Request) {
  try {
    const user = await withAuth();
    const { code } = schema.parse(await req.json());
    const recoveryCodes = await TwoFactorService.enable(user.id, code);
    return json({ recoveryCodes });
  } catch (err) {
    return errorToResponse(err);
  }
}
