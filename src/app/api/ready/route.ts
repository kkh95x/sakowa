import { getDb } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { json, fail } from "@/lib/api/http";

export async function GET() {
  try {
    await migrate();
    const db = await getDb();
    await db.command({ ping: 1 });
    return json({ ok: true });
  } catch {
    return fail("NOT_READY", 503);
  }
}
