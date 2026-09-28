import { ObjectId } from "mongodb";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { fileHttpResponse } from "@/lib/storage/file-response";
import { withAuth } from "@/lib/api/http";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth(["ADMIN", "SUPER_ADMIN"]);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const file = await GridFSStorageService.readBuffer(id);
    if (!file) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return fileHttpResponse(file);
  } catch (err) {
    console.error("FILE_READ_FAILED", err);
    return NextResponse.json(
      { error: "FILE_READ_FAILED", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
