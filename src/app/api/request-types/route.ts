import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { RequestTypeService } from "@/lib/requests/request-type-service";
import { z } from "zod";
import { telegramPromptSchema } from "@/lib/requests/prompt-schema";

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
          branchingRules: r.branchingRules ?? [],
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
  type: z.enum([
    "TEXT",
    "EMAIL",
    "PASSWORD",
    "NUMBER",
    "PHONE",
    "URL",
    "DATE",
    "DATETIME",
    "SELECT",
    "RADIO",
    "CHECKBOX",
    "TEXTAREA",
    "FILE",
    "IMAGE",
    "INSTRUCTION",
    "CONFIRMATION",
    "DYNAMIC",
  ]).default("TEXT"),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  telegramMessage: z.string().optional(),
  telegramPrompt: telegramPromptSchema.optional(),
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
  branchingRules: z
    .array(
      z.object({
        id: z.string().optional().default(""),
        sourceFieldId: z.string(),
        operator: z.enum(["equals", "not_equals", "contains", "is_empty", "is_not_empty"]),
        value: z.string().optional(),
        action: z.enum(["show", "hide", "goto"]),
        targetFieldId: z.string(),
      }),
    )
    .optional(),
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
