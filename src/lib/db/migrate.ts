import { collections, getDb } from "./client";
import { ensureIndexes } from "./indexes";
import { duplicateFieldNames, ensureUniqueFieldNames } from "@/lib/requests/field-names";
import { canonicalizeStatus } from "@/lib/orders/complaint-status";
import { logJson } from "@/lib/log";
import type { RequestField } from "@/types";

const DATABASE_VERSION = 3;

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
    const $set: Record<string, unknown> = {};
    if (dupes.length) $set.fields = ensureUniqueFieldNames(fields);
    if (!Array.isArray(type.branchingRules)) $set.branchingRules = [];
    if (Object.keys($set).length) {
      $set.updatedAt = new Date();
      await db.collection(collections.requestTypes).updateOne({ _id: type._id }, { $set });
      if (dupes.length) {
        logJson("warn", "migrate", "duplicate_field_names_fixed", {
          requestTypeId: String(type._id),
          duplicates: dupes,
        });
      }
    }
  }

  const statusResult = await db.collection(collections.orders).bulkWrite(
    [
      {
        updateMany: {
          filter: { status: "COMPLETED" },
          update: { $set: { status: canonicalizeStatus("COMPLETED"), updatedAt: new Date() } },
        },
      },
      {
        updateMany: {
          filter: { status: "ARCHIVED" },
          update: { $set: { status: canonicalizeStatus("ARCHIVED"), updatedAt: new Date() } },
        },
      },
    ],
    { ordered: false },
  );
  if (statusResult.modifiedCount) {
    logJson("info", "migrate", "complaint_status_canonicalized", {
      modified: statusResult.modifiedCount,
    });
  }
}
