import { collections, getDb } from "@/lib/db/client";

export async function audit(params: {
  actorUserId?: string | null;
  category: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  correlationId?: string;
}) {
  const db = await getDb();
  const safeMeta = { ...(params.metadata ?? {}) };
  for (const key of Object.keys(safeMeta)) {
    if (/password|secret|token|totp|recovery|code/i.test(key)) {
      delete safeMeta[key];
    }
  }
  await db.collection(collections.auditLogs).insertOne({
    actorUserId: params.actorUserId ?? null,
    category: params.category,
    action: params.action,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    metadata: safeMeta,
    ip: params.ip ?? null,
    correlationId: params.correlationId ?? null,
    createdAt: new Date(),
  });
}
