import { z } from "zod";

const blockId = z.string().min(1).max(100);
const mediaBlock = {
  id: blockId,
  storageId: z.string().max(64),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(255).optional(),
  size: z.number().nonnegative().optional(),
};

export const telegramPromptBlockSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ id: blockId, type: z.literal("text"), text: z.string().max(10_000) }),
    z.object({ ...mediaBlock, type: z.literal("image") }),
    z.object({ ...mediaBlock, type: z.literal("document") }),
  ],
  { errorMap: () => ({ message: "INVALID_TELEGRAM_MESSAGE:نوع محتوى Telegram غير مدعوم." }) },
);

export const telegramPromptSchema = z.object({
  blocks: z.array(telegramPromptBlockSchema).max(50),
});
