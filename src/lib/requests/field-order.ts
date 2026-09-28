import { ensureUniqueFieldNames } from "@/lib/requests/field-names";
import type { RequestField } from "@/types";

/** Active fields in the persisted `order` — the exact sequence Telegram asks them in. */
export function askableFields(fields: RequestField[]): RequestField[] {
  return ensureUniqueFieldNames([...fields].filter((f) => f.active !== false).sort((a, b) => a.order - b.order));
}

export function sortFieldsByOrder<T extends Pick<RequestField, "order">>(fields: T[]): T[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => (a.field.order ?? a.index) - (b.field.order ?? b.index) || a.index - b.index)
    .map(({ field }) => field);
}

export function reindexFields<T extends Pick<RequestField, "order">>(fields: T[]): T[] {
  return fields.map((field, order) => (field.order === order ? field : { ...field, order }));
}

/**
 * Body for PUT /api/request-types/:id/fields from builders that edit fields only.
 * `branchingRules` is deliberately absent so the server keeps the stored rules.
 */
export function fieldsOnlyPayload(fields: RequestField[]): { fields: RequestField[] } {
  return { fields: reindexFields(fields) };
}

export function canMoveField(fields: unknown[], index: number, direction: -1 | 1) {
  const target = index + direction;
  return index >= 0 && index < fields.length && target >= 0 && target < fields.length;
}

/** Swaps a field with its neighbour and renumbers `order` to match the new sequence. */
export function moveField<T extends Pick<RequestField, "order">>(fields: T[], index: number, direction: -1 | 1): T[] {
  if (!canMoveField(fields, index, direction)) return fields;
  const next = [...fields];
  const target = index + direction;
  [next[index], next[target]] = [next[target], next[index]];
  return reindexFields(next);
}
