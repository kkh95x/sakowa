import { collections, getDb } from "./client";

export async function ensureIndexes() {
  const db = await getDb();

  await db.collection(collections.users).createIndexes([
    { key: { username: 1 }, unique: true },
    { key: { status: 1 } },
  ]);

  await db.collection(collections.sessions).createIndexes([
    { key: { userId: 1 } },
    { key: { tokenHash: 1 }, unique: true },
  ]);

  await db.collection(collections.bots).createIndexes([
    { key: { telegramBotId: 1 } },
    { key: { username: 1 } },
  ]);

  await db.collection(collections.orders).createIndexes([
    { key: { orderNumber: 1 }, unique: true },
    { key: { userId: 1 } },
    { key: { telegramUserId: 1 } },
    { key: { botId: 1 } },
    { key: { requestTypeId: 1 } },
    { key: { status: 1 } },
    { key: { createdAt: -1 } },
    { key: { requestTypeId: 1, status: 1, createdAt: -1 } },
  ]);

  await db.collection(collections.telegramUsers).createIndex(
    { telegramUserId: 1 },
    { unique: true },
  );

  await db.collection(collections.telegramConversations).createIndexes([
    { key: { telegramUserId: 1 } },
    { key: { botId: 1 } },
    { key: { botId: 1, telegramUserId: 1 }, unique: true },
  ]);

  await db.collection(collections.telegramUserBlocks).createIndexes([
    { key: { telegramUserId: 1 } },
    { key: { requestTypeId: 1 } },
    { key: { active: 1 } },
    {
      key: { telegramUserId: 1, requestTypeId: 1 },
      unique: true,
      partialFilterExpression: { active: true },
    },
  ]);

  await db.collection(collections.notifications).createIndexes([
    { key: { recipientUserId: 1, read: 1, createdAt: -1 } },
    { key: { createdAt: -1 } },
  ]);

  await db.collection(collections.pushSubscriptions).createIndexes([
    { key: { endpoint: 1 }, unique: true },
    { key: { userId: 1 } },
  ]);

  await db.collection(collections.auditLogs).createIndexes([
    { key: { actorUserId: 1 } },
    { key: { category: 1 } },
    { key: { action: 1 } },
    { key: { createdAt: -1 } },
  ]);

  await db.collection(collections.telegramUpdates).createIndex(
    { botId: 1, updateId: 1 },
    { unique: true },
  );

  await db.collection(collections.orderCounters).createIndex({ key: 1 }, { unique: true });

  await db.collection(collections.telegramGroups).createIndexes([
    { key: { chatId: 1, messageThreadId: 1 }, unique: true },
  ]);
}
