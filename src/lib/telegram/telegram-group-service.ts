import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { audit } from "@/lib/audit/audit";

function normalizeThreadId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizeChatId(value: string | number): number {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new Error("INVALID_CHAT_ID");
  return n;
}

export class TelegramGroupService {
  static serialize(g: Record<string, unknown>) {
    return {
      id: String(g._id),
      title: String(g.title ?? ""),
      chatId: g.chatId,
      type: g.type ?? "supergroup",
      messageThreadId: typeof g.messageThreadId === "number" ? g.messageThreadId : null,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  static async list() {
    const db = await getDb();
    return db.collection(collections.telegramGroups).find({}).sort({ updatedAt: -1 }).toArray();
  }

  static async create(params: {
    title: string;
    chatId: string | number;
    messageThreadId?: string | number | null;
    type?: string;
    actorId: string;
  }) {
    const db = await getDb();
    const chatId = normalizeChatId(params.chatId);
    const messageThreadId = normalizeThreadId(params.messageThreadId);
    const existing = await db.collection(collections.telegramGroups).findOne({
      chatId,
      messageThreadId,
    });
    if (existing) throw new Error("GROUP_EXISTS");
    const now = new Date();
    const result = await db.collection(collections.telegramGroups).insertOne({
      title: params.title.trim(),
      chatId,
      messageThreadId,
      type: params.type ?? "supergroup",
      createdAt: now,
      updatedAt: now,
    });
    await audit({
      actorUserId: params.actorId,
      category: "GROUPS",
      action: "GROUP_CREATED",
      entityId: String(result.insertedId),
    });
    return String(result.insertedId);
  }

  static async update(
    id: string,
    params: {
      title?: string;
      chatId?: string | number;
      messageThreadId?: string | number | null;
      type?: string;
      actorId: string;
    },
  ) {
    const db = await getDb();
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (params.title !== undefined) $set.title = params.title.trim();
    if (params.chatId !== undefined) $set.chatId = normalizeChatId(params.chatId);
    if (params.messageThreadId !== undefined) $set.messageThreadId = normalizeThreadId(params.messageThreadId);
    if (params.type !== undefined) $set.type = params.type;
    await db.collection(collections.telegramGroups).updateOne(
      { _id: new ObjectId(id) },
      { $set, $unset: { botId: "" } },
    );
    await audit({
      actorUserId: params.actorId,
      category: "GROUPS",
      action: "GROUP_UPDATED",
      entityId: id,
    });
  }

  static async remove(id: string, actorId: string) {
    const db = await getDb();
    await db.collection(collections.telegramGroups).deleteOne({ _id: new ObjectId(id) });
    await db.collection(collections.requestTypes).updateMany(
      { telegramGroupId: id },
      { $set: { telegramGroupId: null, updatedAt: new Date() } },
    );
    await audit({
      actorUserId: actorId,
      category: "GROUPS",
      action: "GROUP_DELETED",
      entityId: id,
    });
  }
}
