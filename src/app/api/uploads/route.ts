import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { isAllowedUpload, resolveUploadMime } from "@/lib/storage/mime";
import {
  PROMPT_AUDIO_MAX_BYTES,
  PROMPT_AUDIO_MIMES,
  PROMPT_DOCUMENT_MAX_BYTES,
  PROMPT_IMAGE_MAX_BYTES,
  PROMPT_IMAGE_MIMES,
} from "@/lib/telegram/field-prompt";

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
    const purposeRaw = String(form.get("purpose") ?? "");
    if (purposeRaw === "BOT_MEDIA") {
      const blockType = String(form.get("blockType") ?? "");
      if (blockType !== "image" && blockType !== "document" && blockType !== "audio") throw new Error("INVALID_BLOCK_TYPE");
      const baseMime = mime.split(";")[0];
      if (blockType === "image" && !PROMPT_IMAGE_MIMES.includes(baseMime)) throw new Error("INVALID_MIME");
      if (blockType === "audio" && !PROMPT_AUDIO_MIMES.includes(baseMime)) throw new Error("INVALID_MIME");
      const maxBytes =
        blockType === "image" ? PROMPT_IMAGE_MAX_BYTES : blockType === "audio" ? PROMPT_AUDIO_MAX_BYTES : PROMPT_DOCUMENT_MAX_BYTES;
      if (buf.length > maxBytes) {
        throw new Error("FILE_TOO_LARGE");
      }
    }
    const purpose =
      purposeRaw === "ADMIN_ATTACHMENT"
        ? "ADMIN_ATTACHMENT"
        : purposeRaw === "BOT_MEDIA"
          ? "BOT_MEDIA"
          : isImage
            ? "REQUEST_IMAGE"
            : "ORDER_ATTACHMENT";
    const fileId = await GridFSStorageService.save({
      buffer: buf,
      filename,
      mimeType: mime,
      ownerType: purpose === "ADMIN_ATTACHMENT" ? "order" : "request_field",
      ownerId: String(form.get("ownerId") ?? "draft"),
      uploadedBy: user.id,
      purpose,
    });
    return json({ fileId, mimeType: mime, filename, size: buf.length });
  } catch (err) {
    return errorToResponse(err);
  }
}
