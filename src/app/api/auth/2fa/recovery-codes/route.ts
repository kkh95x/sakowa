import { errorToResponse, fail, withAuth } from "@/lib/api/http";

export async function GET() {
  try {
    await withAuth();
    return fail("تُعرض رموز الاسترداد مرة واحدة فقط عند التفعيل", 410);
  } catch (err) {
    return errorToResponse(err);
  }
}
