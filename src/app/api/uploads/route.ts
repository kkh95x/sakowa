import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { isAllowedUpload, resolveUploadMime } from "@/lib/storage/mime";

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("NO_FILE");
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = file.name || "upload.bin";
    const mime = resolveUploadMime(filename, file.type);
    if (!isAllowedUpload(mime, filename)) throw new Error("INVALID_MIME");
    const isImage = mime.startsWith("image/");
    const fileId = await GridFSStorageService.save({
      buffer: buf,
      filename,
      mimeType: mime,
      ownerType: "request_field",
      ownerId: String(form.get("ownerId") ?? "draft"),
      uploadedBy: user.id,
      purpose: isImage ? "REQUEST_IMAGE" : "ORDER_ATTACHMENT",
    });
    return json({ fileId, mimeType: mime, filename });
  } catch (err) {
    return errorToResponse(err);
  }
}
