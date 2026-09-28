import { ObjectId } from "mongodb";
import { randomUUID } from "crypto";
import { collections, getDb } from "@/lib/db/client";
import { audit } from "@/lib/audit/audit";
import { ensureUniqueFieldNames } from "@/lib/requests/field-names";
import { validateBranchingConfig, type BranchingRule } from "@/lib/requests/branching";
import { duplicateOptionValue, normalizeOptions } from "@/lib/requests/field-options";
import { applyPromptBlocks } from "@/lib/telegram/field-prompt";
import { lookupPromptFile, normalizePromptBlocks, type PromptFileLookup } from "@/lib/telegram/prompt-storage";
import type { RequestField } from "@/types";

/** Validates each field's Telegram question message and stores storage-verified blocks. */
export async function normalizeFieldPrompts(
  fields: RequestField[],
  lookup: PromptFileLookup = lookupPromptFile,
): Promise<RequestField[]> {
  const out: RequestField[] = [];
  for (const field of fields) {
    if (!field.telegramPrompt) {
      out.push(field);
      continue;
    }
    const blocks = await normalizePromptBlocks(field.telegramPrompt.blocks, field.label || field.name, lookup);
    out.push(applyPromptBlocks(field, blocks));
  }
  return out;
}

function normalizeFieldOptions(fields: RequestField[]): RequestField[] {
  return fields.map((field) => {
    const options = normalizeOptions(field.options);
    const duplicate = duplicateOptionValue(options);
    if (duplicate) {
      throw new Error(`INVALID_OPTIONS:${field.label || field.name}: المعرّف الداخلي "${duplicate}" مكرر.`);
    }
    return { ...field, options };
  });
}

async function syncCommands(botId: string) {
  try {
    const { TelegramService } = await import("@/lib/telegram/telegram-service");
    await TelegramService.syncBotCommands(botId);
  } catch {
    /* webhook/token may be missing in local setup */
  }
}

export class RequestTypeService {
  static async list() {
    const db = await getDb();
    return db.collection(collections.requestTypes).find({ archivedAt: null }).sort({ createdAt: -1 }).toArray();
  }

  static async getBySlug(slug: string) {
    const db = await getDb();
    const decoded = decodeURIComponent(slug);
    const idCandidate = decoded.startsWith("svc-") ? decoded.slice(4) : decoded;
    if (ObjectId.isValid(idCandidate) && String(new ObjectId(idCandidate)) === idCandidate) {
      const byId = await db.collection(collections.requestTypes).findOne({
        _id: new ObjectId(idCandidate),
        archivedAt: null,
      });
      if (byId) return byId;
    }
    return db.collection(collections.requestTypes).findOne({ slug: decoded, archivedAt: null });
  }

  static async get(id: string) {
    if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) return null;
    const db = await getDb();
    return db.collection(collections.requestTypes).findOne({ _id: new ObjectId(id) });
  }

  static async create(params: {
    name: string;
    botId: string;
    description?: string;
    fields?: RequestField[];
    branchingRules?: BranchingRule[];
    active?: boolean;
    telegramGroupId?: string | null;
    actorId: string;
  }) {
    const db = await getDb();
    const _id = new ObjectId();
    const slug = `svc-${_id.toHexString()}`;
    const now = new Date();
    const prompted = normalizeFieldOptions(await normalizeFieldPrompts(params.fields ?? []));
    const fields = ensureUniqueFieldNames(
      prompted.map((f, i) => ({
        ...f,
        id: f.id || randomUUID(),
        name: (f.name || `field_${i + 1}`).trim() || `field_${i + 1}`,
        label: (f.label || `حقل ${i + 1}`).trim() || `حقل ${i + 1}`,
        order: i,
        required: Boolean(f.required),
        sensitive: false,
        active: f.active !== false,
        options: f.options ?? [],
        telegramMessage: f.telegramMessage ?? "",
        ...(f.imageFileId ? { imageFileId: String(f.imageFileId) } : {}),
        ...(f.attachmentFileId ? { attachmentFileId: String(f.attachmentFileId) } : {}),
      })),
    );
    const branchingRules = (params.branchingRules ?? []).map((rule) => ({
      ...rule,
      id: rule.id || randomUUID(),
    }));
    const branchingErrors = validateBranchingConfig(fields, branchingRules);
    if (branchingErrors.length) {
      throw new Error(`INVALID_BRANCHING:${branchingErrors[0].message}`);
    }
    const active = Boolean(params.active);
    await db.collection(collections.requestTypes).insertOne({
      _id,
      name: params.name.trim(),
      slug,
      botId: params.botId,
      description: params.description ?? "",
      fields,
      branchingRules,
      active,
      telegramGroupId: params.telegramGroupId ?? null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await audit({
      actorUserId: params.actorId,
      category: "REQUESTS",
      action: "REQUEST_TYPE_CREATED",
      entityId: String(_id),
      after: {
        id: String(_id),
        name: params.name.trim(),
        slug,
        botId: params.botId,
        description: params.description ?? "",
        fields,
        active,
        telegramGroupId: params.telegramGroupId ?? null,
      },
    });
    if (active) await syncCommands(params.botId);
    return { id: String(_id), slug };
  }

  static async updateFields(
    id: string,
    fields: RequestField[],
    actorId: string,
    branchingRules?: BranchingRule[],
  ) {
    const db = await getDb();
    const prompted = normalizeFieldOptions(await normalizeFieldPrompts(fields));
    const normalized = ensureUniqueFieldNames(
      prompted.map((f, i) => ({
        ...f,
        id: f.id || randomUUID(),
        order: i,
        required: Boolean(f.required),
        sensitive: false,
        active: f.active !== false,
        options: f.options ?? [],
        telegramMessage: f.telegramMessage ?? "",
        ...(f.imageFileId ? { imageFileId: String(f.imageFileId) } : {}),
        ...(f.attachmentFileId ? { attachmentFileId: String(f.attachmentFileId) } : {}),
      })),
    );
    const existing = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(id) });
    const nextRules = (branchingRules ?? ((existing?.branchingRules as BranchingRule[]) ?? [])).map((rule) => ({
      ...rule,
      id: rule.id || randomUUID(),
    }));
    const branchingErrors = validateBranchingConfig(normalized, nextRules);
    if (branchingErrors.length) {
      throw new Error(`INVALID_BRANCHING:${branchingErrors[0].message}`);
    }
    await db.collection(collections.requestTypes).updateOne(
      { _id: new ObjectId(id) },
      { $set: { fields: normalized, branchingRules: nextRules, updatedAt: new Date() } },
    );
    await audit({
      actorUserId: actorId,
      category: "REQUESTS",
      action: "REQUEST_FIELDS_UPDATED",
      entityId: id,
      before: existing,
      after: { ...existing, fields: normalized, branchingRules: nextRules, updatedAt: new Date() },
    });
  }

  static async setActive(id: string, active: boolean, actorId: string) {
    const db = await getDb();
    const item = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(id) });
    const updatedAt = new Date();
    await db.collection(collections.requestTypes).updateOne(
      { _id: new ObjectId(id) },
      { $set: { active, updatedAt } },
    );
    await audit({
      actorUserId: actorId,
      category: "REQUESTS",
      action: active ? "REQUEST_ACTIVATED" : "REQUEST_DEACTIVATED",
      entityId: id,
      before: item,
      after: { ...item, active, updatedAt },
    });
    if (item?.botId) await syncCommands(String(item.botId));
  }

  static async archive(id: string, actorId: string) {
    const db = await getDb();
    const item = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(id) });
    const updatedAt = new Date();
    await db.collection(collections.requestTypes).updateOne(
      { _id: new ObjectId(id) },
      { $set: { archivedAt: updatedAt, active: false, updatedAt } },
    );
    await audit({
      actorUserId: actorId,
      category: "REQUESTS",
      action: "REQUEST_ARCHIVED",
      entityId: id,
      before: item,
      after: { ...item, archivedAt: updatedAt, active: false, updatedAt },
    });
    if (item?.botId) await syncCommands(String(item.botId));
  }

  static async linkGroup(id: string, telegramGroupId: string | null, actorId: string) {
    const db = await getDb();
    const existing = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(id) });
    const updatedAt = new Date();
    await db.collection(collections.requestTypes).updateOne(
      { _id: new ObjectId(id) },
      { $set: { telegramGroupId, updatedAt } },
    );
    await audit({
      actorUserId: actorId,
      category: "REQUESTS",
      action: "REQUEST_GROUP_LINKED",
      entityId: id,
      before: existing,
      after: { ...existing, telegramGroupId, updatedAt },
    });
  }

  static async update(
    id: string,
    params: { name?: string; description?: string; botId?: string; actorId: string },
  ) {
    const db = await getDb();
    const existing = await db.collection(collections.requestTypes).findOne({ _id: new ObjectId(id) });
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (params.name !== undefined) $set.name = params.name.trim();
    if (params.description !== undefined) $set.description = params.description;
    if (params.botId !== undefined) $set.botId = params.botId;
    await db.collection(collections.requestTypes).updateOne({ _id: new ObjectId(id) }, { $set });
    await audit({
      actorUserId: params.actorId,
      category: "REQUESTS",
      action: "REQUEST_TYPE_UPDATED",
      entityId: id,
      before: existing,
      after: { ...existing, ...$set },
    });
    const bots = new Set<string>();
    if (existing?.botId) bots.add(String(existing.botId));
    if (params.botId) bots.add(params.botId);
    for (const botId of bots) await syncCommands(botId);
  }
}
