import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { z } from "zod";

export async function GET() {
  try {
    await withAuth();
    const items = await RequestTypeService.list();
    return json({
      requestTypes: items.map((r) => {
        const id = String(r._id);
        return {
          id,
          name: r.name,
          slug: String(r.slug || `svc-${id}`),
          botId: r.botId,
          active: r.active,
          fields: r.fields,
          telegramGroupId: r.telegramGroupId,
          description: r.description,
        };
      }),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

const fieldSchema = z.object({
  id: z.string().optional().default(""),
  name: z.string().optional().default(""),
  label: z.string().optional().default(""),
  type: z.string().default("TEXT"),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  telegramMessage: z.string().optional(),
  required: z.boolean().optional().default(true),
  sensitive: z.boolean().optional().default(false),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  order: z.number().optional().default(0),
  active: z.boolean().optional().default(true),
  imageFileId: z.string().optional(),
  attachmentFileId: z.string().optional(),
});

const schema = z.object({
  name: z.string().min(1),
  botId: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(fieldSchema).optional(),
  active: z.boolean().optional(),
  telegramGroupId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await withAuth(["ADMIN"]);
    const body = schema.parse(await req.json());
    const created = await RequestTypeService.create({
      ...body,
      fields: body.fields as never,
      actorId: user.id,
    });
    return json(created);
  } catch (err) {
    return errorToResponse(err);
  }
}
