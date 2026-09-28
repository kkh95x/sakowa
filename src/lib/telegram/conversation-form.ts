import { pruneHiddenAnswers, readAnswer, visibleFieldIds, type BranchingRule } from "@/lib/requests/branching";
import { askableFields } from "@/lib/requests/field-order";
import type { RequestField } from "@/types";

/**
 * The form a Telegram conversation was started with. Admin edits made afterwards
 * (order, labels, prompts, options, required, rules, active state) apply to new
 * conversations only; an in-progress conversation keeps following this snapshot.
 */
export interface FormSnapshot {
  requestTypeId: string;
  requestTypeName: string;
  requestTypeUpdatedAt: Date | null;
  capturedAt: Date;
  fields: RequestField[];
  branchingRules: BranchingRule[];
}

export type LegacyAdoption = "legacy-index" | "legacy-resynced";

export interface ConversationForm {
  snapshot: FormSnapshot;
  fields: RequestField[];
  rules: BranchingRule[];
  /** Index into `fields` of the question being answered; `fields.length` when none is pending. */
  currentIndex: number;
  /** Set when an old index-only conversation was converted on this read. */
  adopted: LegacyAdoption | null;
}

type RequestTypeDoc = {
  _id: unknown;
  name?: unknown;
  fields?: unknown;
  branchingRules?: unknown;
  updatedAt?: unknown;
};

type ConversationDoc = {
  requestTypeId?: unknown;
  fieldIndex?: unknown;
  currentFieldId?: unknown;
  formSnapshot?: unknown;
  draft?: unknown;
  updatedAt?: unknown;
};

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function captureFormSnapshot(request: RequestTypeDoc, now = new Date()): FormSnapshot {
  return {
    requestTypeId: String(request._id),
    requestTypeName: String(request.name ?? ""),
    requestTypeUpdatedAt: asDate(request.updatedAt),
    capturedAt: now,
    fields: askableFields((request.fields as RequestField[]) ?? []),
    branchingRules: (request.branchingRules as BranchingRule[]) ?? [],
  };
}

export function isFormSnapshot(value: unknown, requestTypeId: unknown): value is FormSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as Partial<FormSnapshot>;
  return (
    Array.isArray(snap.fields) &&
    Array.isArray(snap.branchingRules) &&
    requestTypeId != null &&
    snap.requestTypeId === String(requestTypeId)
  );
}

function hasAnswer(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** First visible, unanswered question — used when a stored position can no longer be trusted. */
export function firstPendingIndex(
  fields: RequestField[],
  rules: BranchingRule[],
  draft: Record<string, unknown>,
): number {
  const pruned = pruneHiddenAnswers(fields, rules, draft);
  const visible = visibleFieldIds(fields, rules, pruned);
  const index = fields.findIndex(
    (f) => f.type !== "INSTRUCTION" && visible.has(f.id) && !hasAnswer(readAnswer(pruned, f)),
  );
  return index < 0 ? fields.length : index;
}

/**
 * Resolves which exact field the conversation is on.
 * - Snapshot conversations resolve `currentFieldId` against their own snapshot.
 * - Old conversations (index only) are adopted: the index is trusted only when the
 *   request type has not been saved since the user was last asked; otherwise the
 *   conversation resumes at the first unanswered question instead of guessing.
 */
export function resolveConversationForm(
  state: ConversationDoc,
  liveRequest: RequestTypeDoc | null,
  now = new Date(),
): ConversationForm | null {
  const draft = (state.draft as Record<string, unknown>) ?? {};

  if (isFormSnapshot(state.formSnapshot, state.requestTypeId)) {
    const snapshot = state.formSnapshot;
    const fields = snapshot.fields;
    const rules = snapshot.branchingRules;
    let currentIndex = fields.length;
    if (state.currentFieldId != null) {
      const byId = fields.findIndex((f) => f.id === state.currentFieldId);
      currentIndex = byId >= 0 ? byId : firstPendingIndex(fields, rules, draft);
    }
    return { snapshot, fields, rules, currentIndex, adopted: null };
  }

  if (!liveRequest) return null;
  const snapshot = captureFormSnapshot(liveRequest, now);
  const fields = snapshot.fields;
  const rules = snapshot.branchingRules;
  const index = typeof state.fieldIndex === "number" ? state.fieldIndex : Number(state.fieldIndex);
  const lastAskedAt = asDate(state.updatedAt);
  const configSavedAt = snapshot.requestTypeUpdatedAt;
  const unchangedSinceAsked = Boolean(lastAskedAt && configSavedAt && configSavedAt.getTime() <= lastAskedAt.getTime());
  if (unchangedSinceAsked && Number.isInteger(index) && index >= 0 && index <= fields.length) {
    return { snapshot, fields, rules, currentIndex: index, adopted: "legacy-index" };
  }
  return { snapshot, fields, rules, currentIndex: firstPendingIndex(fields, rules, draft), adopted: "legacy-resynced" };
}

/** Conversation fields that record the position by identity (index kept for logs only). */
export function positionFields(fields: RequestField[], index: number) {
  return { currentFieldId: fields[index]?.id ?? null, fieldIndex: index };
}
