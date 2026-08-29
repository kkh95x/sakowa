import { collections, getDb } from "./client";
import { ensureIndexes } from "./indexes";
import { duplicateFieldNames, ensureUniqueFieldNames } from "@/lib/requests/field-names";
import { logJson } from "@/lib/log";
import type { RequestField } from "@/types";

const DATABASE_VERSION = 2;

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

  const types = await db.collection(collections.requestTypes).find({}).toArray();
  for (const type of types) {
    const fields = (type.fields as RequestField[] | undefined) ?? [];
    const dupes = duplicateFieldNames(fields);
    if (!dupes.length) continue;
    const next = ensureUniqueFieldNames(fields);
    await db.collection(collections.requestTypes).updateOne(
      { _id: type._id },
      { $set: { fields: next, updatedAt: new Date() } },
    );
    logJson("warn", "migrate", "duplicate_field_names_fixed", {
      requestTypeId: String(type._id),
      duplicates: dupes,
    });
  }
}
