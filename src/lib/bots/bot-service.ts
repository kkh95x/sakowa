import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { encrypt } from "@/lib/security/crypto";
import { audit } from "@/lib/audit/audit";
import { randomToken } from "@/lib/security/crypto";
import { telegramBotCall } from "@/lib/telegram/api";
import type { BotStatus } from "@/types";

export type BotLastMessage = {
  text: string;
  fromName: string;
  fromUsername: string | null;
  telegramUserId: number | null;
  at: string | null;
};

function serializeLastMessage(value: unknown): BotLastMessage | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  const at = m.at instanceof Date ? m.at.toISOString() : m.at ? String(m.at) : null;
  return {
    text: String(m.text ?? ""),
    fromName: String(m.fromName ?? ""),
    fromUsername: m.fromUsername ? String(m.fromUsername) : null,
    telegramUserId: typeof m.telegramUserId === "number" ? m.telegramUserId : null,
    at,
  };
}

export function serializeBot(b: Record<string, unknown>) {
  return {
    id: String(b._id),
    name: b.name,
    username: b.username,
    status: b.status,
    telegramBotId: b.telegramBotId,
    details: typeof b.details === "string" ? b.details : "",
    logoFileId: b.logoFileId ? String(b.logoFileId) : null,
    lastMessage: serializeLastMessage(b.lastMessage),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export class BotService {
  static async list() {
    const db = await getDb();
    return db
      .collection(collections.bots)
      .find({}, { projection: { tokenEncrypted: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
  }

  static async get(id: string) {
    const db = await getDb();
    return db.collection(collections.bots).findOne(
      { _id: new ObjectId(id) },
      { projection: { tokenEncrypted: 0 } },
    );
  }

  static async create(params: {
    name: string;
    token: string;
    actorId: string;
  }) {
    const json = await telegramBotCall<{ ok: boolean; result?: { username: string; id: number } }>(
      params.token,
      "getMe",
    );
    if (!json.ok || !json.result) throw new Error("INVALID_BOT_TOKEN");
    const webhookSecret = randomToken(16);
    const db = await getDb();
    const now = new Date();
    const result = await db.collection(collections.bots).insertOne({
      name: params.name,
      username: json.result.username,
      telegramBotId: json.result.id,
      tokenEncrypted: encrypt(params.token),
      webhookSecret,
      status: "STOPPED" satisfies BotStatus,
      createdAt: now,
      updatedAt: now,
    });
    await audit({
      actorUserId: params.actorId,
      category: "BOTS",
      action: "BOT_CREATED",
      entityId: String(result.insertedId),
    });
    return String(result.insertedId);
  }

  static async update(
    id: string,
    params: { name?: string; details?: string; logoFileId?: string; actorId: string },
  ) {
    const db = await getDb();
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (params.name !== undefined) $set.name = params.name;
    if (params.details !== undefined) $set.details = params.details;
    if (params.logoFileId !== undefined) $set.logoFileId = params.logoFileId;
    await db.collection(collections.bots).updateOne({ _id: new ObjectId(id) }, { $set });
    await audit({
      actorUserId: params.actorId,
      category: "BOTS",
      action: "BOT_UPDATED",
      entityId: id,
    });
  }

  static async setStatus(id: string, status: BotStatus, actorId: string, action: string) {
    const db = await getDb();
    await db.collection(collections.bots).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
    );
    await audit({ actorUserId: actorId, category: "BOTS", action, entityId: id });
  }

  static async remove(id: string, actorId: string) {
    const db = await getDb();
    const bot = await db.collection(collections.bots).findOne({ _id: new ObjectId(id) });
    if (!bot) throw new Error("NOT_FOUND");
    await db.collection(collections.requestTypes).updateMany(
      { botId: id },
      { $set: { archivedAt: new Date(), active: false, updatedAt: new Date() } },
    );
    await db.collection(collections.bots).deleteOne({ _id: new ObjectId(id) });
    await audit({ actorUserId: actorId, category: "BOTS", action: "BOT_DELETED", entityId: id });
  }
}
