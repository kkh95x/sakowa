import { collections, getDb } from "@/lib/db/client";

const SENSITIVE_KEY = /password|secret|token|totp|recovery|hash|encrypted/i;

function isBsonType(value: object): boolean {
  return typeof (value as { _bsontype?: string })._bsontype === "string";
}

export function sanitizeAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `[buffer ${value.length}]`;
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (typeof value === "object") {
    if (isBsonType(value)) return String(value);
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key) || key.startsWith("$")) continue;
      if (key === "_id") {
        out.id = String(nested);
        continue;
      }
      out[key] = sanitizeAuditValue(nested);
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function toAuditSnapshot(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  const sanitized = sanitizeAuditValue(value);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return { value: sanitized };
}

export function serializeAuditLog(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    actorUserId: doc.actorUserId ?? null,
    category: doc.category,
    action: doc.action,
    entityType: doc.entityType ?? null,
    entityId: doc.entityId ?? null,
    metadata: sanitizeAuditValue(doc.metadata ?? {}) as Record<string, unknown>,
    before: doc.before != null ? sanitizeAuditValue(doc.before) : null,
    after: doc.after != null ? sanitizeAuditValue(doc.after) : null,
    ip: doc.ip ?? null,
    correlationId: doc.correlationId ?? null,
    createdAt: doc.createdAt,
  };
}

export async function audit(params: {
  actorUserId?: string | null;
  category: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  ip?: string;
  correlationId?: string;
}) {
  const db = await getDb();
  const metadata = (toAuditSnapshot(params.metadata ?? {}) ?? {}) as Record<string, unknown>;
  const before = toAuditSnapshot(params.before);
  const after = toAuditSnapshot(params.after);
  await db.collection(collections.auditLogs).insertOne({
    actorUserId: params.actorUserId ?? null,
    category: params.category,
    action: params.action,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    metadata,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ip: params.ip ?? null,
    correlationId: params.correlationId ?? null,
    createdAt: new Date(),
  });
}
