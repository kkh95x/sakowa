import { NextResponse } from "next/server";
import { getCurrentUser, requireRole, requireUser } from "@/lib/auth/session";
import type { Role } from "@/types";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

export async function withAuth(roles?: Role[]) {
  if (roles) return requireRole(roles);
  return requireUser();
}

export async function optionalUser() {
  return getCurrentUser();
}

export function errorToResponse(err: unknown) {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues?: { message?: string }[] }).issues;
    const message = issues?.[0]?.message || "INVALID";
    return fail(message, 400);
  }
  const message = err instanceof Error ? err.message : "UNKNOWN";
  const code = message.split(":")[0]?.trim() || message;
  const map: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    RATE_LIMITED: 429,
    INVALID_CREDENTIALS: 401,
    INVALID_TOTP: 401,
    ACCOUNT_DISABLED: 403,
    INVALID_BOT_TOKEN: 400,
    TELEGRAM_UNREACHABLE: 502,
    TELEGRAM_FILE: 502,
    TELEGRAM_BAD_RESPONSE: 502,
    FILE_READ_FAILED: 500,
  };
  return fail(message, map[code] ?? 400);
}
