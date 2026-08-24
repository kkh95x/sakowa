import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { TwoFactorService } from "@/lib/auth/two-factor";

export async function POST() {
  try {
    const user = await withAuth();
    const result = await TwoFactorService.startSetup(user.id, user.username);
    return json(result);
  } catch (err) {
    return errorToResponse(err);
  }
}
