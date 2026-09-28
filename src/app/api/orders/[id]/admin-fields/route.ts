import { ObjectId } from "mongodb";
import { z } from "zod";
import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { OrderService } from "@/lib/orders/order-service";
import { GridFSStorageService } from "@/lib/storage/gridfs";
import { isAllowedUpload, resolveUploadMime } from "@/lib/storage/mime";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  shamCashReceiptNumber: z.string().max(120).optional(),
  adminNotes: z.string().max(4000).optional(),
  invoiceNumber: z.string().max(120).optional(),
  paymentDate: z.string().max(32).optional(),
  invoiceFileId: z.string().nullable().optional(),
  invoiceFilename: z.string().max(180).nullable().optional(),
  clearInvoice: z.boolean().optional(),
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
      const file = form.get("invoiceFile");
      let invoiceFileId: string | undefined;
      let invoiceFilename: string | undefined;
      if (file instanceof File && file.size > 0) {
        const buf = Buffer.from(await file.arrayBuffer());
        const filename = file.name || "invoice.bin";
        const mime = resolveUploadMime(filename, file.type);
        if (!isAllowedUpload(mime, filename, true)) throw new Error("INVALID_MIME");
        invoiceFileId = await GridFSStorageService.save({
          buffer: buf,
          filename,
          mimeType: mime,
          ownerType: "order",
          ownerId: id,
          uploadedBy: user.id,
          purpose: "ADMIN_ATTACHMENT",
        });
        invoiceFilename = filename;
      }
      body = schema.parse({
        shamCashReceiptNumber: String(form.get("shamCashReceiptNumber") ?? ""),
        adminNotes: String(form.get("adminNotes") ?? ""),
        invoiceNumber: String(form.get("invoiceNumber") ?? ""),
        paymentDate: String(form.get("paymentDate") ?? ""),
        invoiceFileId,
        invoiceFilename,
        clearInvoice: invoiceFileId ? false : String(form.get("clearInvoice") ?? "") === "true",
      });
    } else {
      body = schema.parse(await req.json());
    }

    if (body.invoiceFileId && !ObjectId.isValid(body.invoiceFileId)) {
      throw new Error("INVALID");
    }

    const adminFields = await OrderService.updateAdminFields({
      orderId: id,
      actorId: user.id,
      shamCashReceiptNumber: body.shamCashReceiptNumber,
      adminNotes: body.adminNotes,
      invoiceNumber: body.invoiceNumber,
      paymentDate: body.paymentDate,
      invoiceFileId: body.invoiceFileId,
      invoiceFilename: body.invoiceFilename ?? undefined,
      clearInvoice: body.clearInvoice,
    });
    return json({ adminFields });
  } catch (err) {
    return errorToResponse(err);
  }
}
