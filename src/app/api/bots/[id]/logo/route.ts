import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { BotService, serializeBot } from "@/lib/bots/bot-service";
import { GridFSStorageService } from "@/lib/storage/gridfs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await withAuth(["ADMIN"]);
    const { id } = await ctx.params;
    const bot = await BotService.get(id);
    if (!bot) return json({ error: "NOT_FOUND" }, 404);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("NO_FILE");
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/png";
    if (!mime.startsWith("image/")) throw new Error("INVALID_MIME");
    const fileId = await GridFSStorageService.save({
      buffer: buf,
      filename: file.name || "logo.png",
      mimeType: mime,
      ownerType: "bot",
      ownerId: id,
      uploadedBy: user.id,
      purpose: "BOT_LOGO",
    });
    await BotService.update(id, { logoFileId: fileId, actorId: user.id });
    const updated = await BotService.get(id);
    if (!updated) return json({ error: "NOT_FOUND" }, 404);
    return json({ fileId, bot: serializeBot(updated as Record<string, unknown>) });
  } catch (err) {
    return errorToResponse(err);
  }
}
