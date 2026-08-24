import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { audit } from "@/lib/audit/audit";

export class BlockedUserService {
  static async list() {
    const db = await getDb();
    return db
      .collection(collections.telegramUserBlocks)
      .find({ active: true })
      .sort({ blockedAt: -1 })
      .toArray();
  }

  static async isBlocked(telegramUserId: number, requestTypeId: string) {
    const db = await getDb();
    const row = await db.collection(collections.telegramUserBlocks).findOne({
      telegramUserId,
      requestTypeId,
      active: true,
    });
    return Boolean(row);
  }

  static async block(params: {
    telegramUserId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    botId: string;
    requestTypeId: string;
    reason?: string;
    actorId: string;
  }) {
    if (await this.isBlocked(params.telegramUserId, params.requestTypeId)) {
      throw new Error("ALREADY_BLOCKED");
    }
    const db = await getDb();
    const result = await db.collection(collections.telegramUserBlocks).insertOne({
      telegramUserId: params.telegramUserId,
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      lastName: params.lastName ?? null,
      phoneNumber: null,
      botId: params.botId,
      requestTypeId: params.requestTypeId,
      reason: params.reason ?? "",
      blockedBy: params.actorId,
      blockedAt: new Date(),
      unblockedBy: null,
      unblockedAt: null,
      active: true,
    });
    await audit({
      actorUserId: params.actorId,
      category: "BLOCKS",
      action: "USER_BLOCKED",
      entityId: String(result.insertedId),
    });
    return String(result.insertedId);
  }

  static async unblock(id: string, actorId: string) {
    const db = await getDb();
    await db.collection(collections.telegramUserBlocks).updateOne(
      { _id: new ObjectId(id) },
      { $set: { active: false, unblockedBy: actorId, unblockedAt: new Date() } },
    );
    await audit({ actorUserId: actorId, category: "BLOCKS", action: "USER_UNBLOCKED", entityId: id });
  }
}
