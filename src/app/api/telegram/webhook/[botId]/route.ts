import { collections, getDb } from "@/lib/db/client";
import { TelegramConversationService } from "@/lib/telegram/conversation";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ botId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { botId } = await ctx.params;
  if (!ObjectId.isValid(botId)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const db = await getDb();
  const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(botId) });
  if (!bot) return NextResponse.json({ ok: false }, { status: 404 });
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== bot.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();
  await TelegramConversationService.process(botId, update);
  return NextResponse.json({ ok: true });
}
