import { MongoClient, Db, GridFSBucket } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB_NAME ?? "bothub";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient() {
  return new MongoClient(uri, {
    maxPoolSize: 20,
  });
}

const clientPromise = globalThis._mongoClientPromise ?? createClient().connect();

if (process.env.NODE_ENV !== "production") {
  globalThis._mongoClientPromise = clientPromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}

export async function getGridFSBucket(): Promise<GridFSBucket> {
  const db = await getDb();
  const bucketName = process.env.GRIDFS_BUCKET ?? "appFiles";
  return new GridFSBucket(db, { bucketName });
}

export const collections = {
  users: "users",
  sessions: "sessions",
  bots: "bots",
  requestTypes: "requestTypes",
  orders: "orders",
  orderCounters: "orderCounters",
  orderStatusHistory: "orderStatusHistory",
  telegramUsers: "telegramUsers",
  telegramConversations: "telegramConversations",
  telegramGroups: "telegramGroups",
  telegramUserBlocks: "telegramUserBlocks",
  notifications: "notifications",
  notificationOutbox: "notificationOutbox",
  pushSubscriptions: "pushSubscriptions",
  auditLogs: "auditLogs",
  twoFactorRecoveryCodes: "twoFactorRecoveryCodes",
  telegramUpdates: "telegramUpdates",
  passwordHistory: "passwordHistory",
} as const;
