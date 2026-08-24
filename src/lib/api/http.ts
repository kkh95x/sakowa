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
  const message = err instanceof Error ? err.message : "UNKNOWN";
  const map: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    RATE_LIMITED: 429,
    INVALID_CREDENTIALS: 401,
    INVALID_TOTP: 401,
    ACCOUNT_DISABLED: 403,
  };
  return fail(message, map[message] ?? 400);
}
