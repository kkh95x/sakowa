import { ObjectId } from "mongodb";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { withAuth } from "@/lib/api/http";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "file.bin";
  const encoded = encodeURIComponent(filename);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await withAuth();
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
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": contentDisposition(file.filename),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("FILE_READ_FAILED", err);
    return NextResponse.json(
      { error: "FILE_READ_FAILED", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
