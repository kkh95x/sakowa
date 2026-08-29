import { NextResponse } from "next/server";

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "file.bin";
  const encoded = encodeURIComponent(filename);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function fileHttpResponse(file: { buffer: Buffer; mimeType: string; filename: string }) {
  return new NextResponse(Uint8Array.from(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": contentDisposition(file.filename),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(file.buffer.length),
    },
  });
}
