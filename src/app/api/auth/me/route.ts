import { errorToResponse, json, withAuth } from "@/lib/api/http";

export async function GET() {
  try {
    const user = await withAuth();
    return json({ user });
  } catch (err) {
    return errorToResponse(err);
  }
}
