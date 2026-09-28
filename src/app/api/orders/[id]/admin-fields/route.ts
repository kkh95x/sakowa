import { ObjectId } from "mongodb";
import { z } from "zod";
import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { isAllowedUpload, resolveUploadMime } from "@/lib/storage/mime";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  adminNotes: z.string().max(4000).optional(),
  attachmentFileId: z.string().nullable().optional(),
  attachmentFilename: z.string().max(180).nullable().optional(),
  clearAttachment: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) throw new Error("NOT_FOUND");

    const contentType = req.headers.get("content-type") ?? "";
    let body: z.infer<typeof schema>;
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("attachmentFile");
      let attachmentFileId: string | undefined;
      let attachmentFilename: string | undefined;
      if (file instanceof File && file.size > 0) {
        const buf = Buffer.from(await file.arrayBuffer());
        const filename = file.name || "attachment.bin";
        const mime = resolveUploadMime(filename, file.type);
        if (!isAllowedUpload(mime, filename, true)) throw new Error("INVALID_MIME");
        attachmentFileId = await GridFSStorageService.save({
          buffer: buf,
          filename,
          mimeType: mime,
          ownerType: "order",
          ownerId: id,
          uploadedBy: user.id,
          purpose: "ADMIN_ATTACHMENT",
        });
        attachmentFilename = filename;
      }
      body = schema.parse({
        adminNotes: form.has("adminNotes") ? String(form.get("adminNotes") ?? "") : undefined,
        attachmentFileId,
        attachmentFilename,
        clearAttachment: attachmentFileId ? false : String(form.get("clearAttachment") ?? "") === "true",
      });
    } else {
      body = schema.parse(await req.json());
    }

    if (body.attachmentFileId && !ObjectId.isValid(body.attachmentFileId)) {
      throw new Error("INVALID");
    }

    const adminFields = await OrderService.updateAdminFields({
      orderId: id,
      actorId: user.id,
      adminNotes: body.adminNotes,
      attachmentFileId: body.attachmentFileId,
      attachmentFilename: body.attachmentFilename ?? undefined,
      clearAttachment: body.clearAttachment,
    });
    return json({ adminFields });
  } catch (err) {
    return errorToResponse(err);
  }
}
