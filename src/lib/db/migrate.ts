import { collections, getDb } from "./client";
import { ensureIndexes } from "./indexes";

const DATABASE_VERSION = 1;

export async function migrate() {
  await ensureIndexes();
  const db = await getDb();
  await db.collection("_meta").updateOne(
    { key: "databaseVersion" },
    {
      $set: { value: DATABASE_VERSION, updatedAt: new Date() },
      $setOnInsert: { key: "databaseVersion" },
    },
    { upsert: true },
  );
  await db.collection(collections.orderCounters).updateOne(
    { key: "global" },
    { $setOnInsert: { key: "global", seq: 0 } },
    { upsert: true },
  );
}
