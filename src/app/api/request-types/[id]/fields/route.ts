import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const fieldSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.string(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  telegramMessage: z.string().optional(),
  required: z.boolean(),
  sensitive: z.boolean(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  order: z.number(),
  active: z.boolean(),
  imageFileId: z.string().optional(),
  attachmentFileId: z.string().optional(),
});

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const body = z.object({ fields: z.array(fieldSchema) }).parse(await req.json());
    await RequestTypeService.updateFields(id, body.fields as never, user.id);
    return json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
