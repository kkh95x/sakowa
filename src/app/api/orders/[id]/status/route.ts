import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import {
  REJECTION_REASON_MAX,
  STATUS_ERROR_AR,
  STATUS_NOTE_MAX,
  isStatusChangeErrorCode,
} from "@/lib/orders/complaint-status";
import type { OrderStatus } from "@/types";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(
    ["PENDING", "REVIEWING", "IN_PROGRESS", "RESOLVED", "REJECTED", "CLOSED", "COMPLETED", "ARCHIVED"],
    { errorMap: () => ({ message: STATUS_ERROR_AR.INVALID_STATUS }) },
  ),
  message: z.string().max(4000, "رسالة المستخدم طويلة جداً.").optional(),
  attachmentFileId: z.string().optional(),
  reason: z.string().max(REJECTION_REASON_MAX + 200, STATUS_ERROR_AR.REJECTION_REASON_TOO_LONG).optional(),
  resolutionNote: z.string().max(STATUS_NOTE_MAX + 200, STATUS_ERROR_AR.STATUS_NOTE_TOO_LONG).optional(),
  closingNote: z.string().max(STATUS_NOTE_MAX + 200, STATUS_ERROR_AR.STATUS_NOTE_TOO_LONG).optional(),
});

const AUTH_ERROR_AR: Record<string, [string, number]> = {
  UNAUTHORIZED: ["يجب تسجيل الدخول لتغيير حالة الشكوى.", 401],
  FORBIDDEN: ["لا تملك صلاحية تغيير حالة الشكوى.", 403],
  NOT_FOUND: ["الشكوى غير موجودة.", 404],
};

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: "VALIDATION", message: parsed.error.issues[0]?.message ?? STATUS_ERROR_AR.INVALID_STATUS }, 400);
    }
    const body = parsed.data;
    await OrderService.changeStatus({
      orderId: id,
      next: body.status as OrderStatus,
      actorId: user.id,
      message: body.message,
      attachmentFileId: body.attachmentFileId,
      reason: body.reason,
      resolutionNote: body.resolutionNote,
      closingNote: body.closingNote,
    });
    return json({ ok: true });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (isStatusChangeErrorCode(code)) {
      return json({ error: code, message: STATUS_ERROR_AR[code] }, code === "STATUS_CONFLICT" ? 409 : 400);
    }
    if (code in AUTH_ERROR_AR) {
      const [message, status] = AUTH_ERROR_AR[code];
      return json({ error: code, message }, status);
    }
    return errorToResponse(err);
  }
}
