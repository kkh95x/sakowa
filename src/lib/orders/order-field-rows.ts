import { displayFieldAnswer, parseFieldAnswer, type FieldAnswer } from "@/lib/orders/field-answer";
import type { RequestField } from "@/types";

/*
 * Source-of-truth rule for field definitions:
 * - A submitted order is presented with `order.formFields` (the definitions it was
 *   validated against): order, labels, types, sensitive flag and option labels.
 *   Live request-type edits never change how an existing order reads.
 * - Only older orders without `formFields` fall back to the live request type.
 * - New complaints, form editing and table/filter layouts use `requestType.fields`.
 * Every reader of a submitted order's answers goes through `orderFieldDefinitions`.
 */

/** Field definitions kept on an order so its answers stay readable after the form changes. */
export type OrderFormField = Pick<RequestField, "id" | "name" | "label" | "type" | "order"> &
  Partial<Pick<RequestField, "options" | "telegramMessage" | "sensitive">>;

export function formFieldsForOrder(fields: RequestField[]): OrderFormField[] {
  return fields
    .filter((f) => f.type !== "INSTRUCTION")
    .map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label,
      type: f.type,
      order: f.order,
      ...(f.options?.length ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
      ...(f.telegramMessage ? { telegramMessage: f.telegramMessage } : {}),
      ...(f.sensitive ? { sensitive: true } : {}),
    }));
}

function asFormFields(value: unknown): OrderFormField[] {
  return Array.isArray(value) ? (value.filter((f) => f && typeof f === "object" && f.name) as OrderFormField[]) : [];
}

export function hasStoredFormFields(order: Record<string, unknown>) {
  return asFormFields(order.formFields).length > 0;
}

/**
 * Field definitions a submitted order's answers are read with: the definitions stored at
 * submission (in their stored order, with their stored option labels), or the live
 * request-type fields for older orders that predate `formFields`.
 */
export function orderFieldDefinitions(order: Record<string, unknown>, liveFields: RequestField[]): RequestField[] {
  const stored = asFormFields(order.formFields);
  if (!stored.length) return liveFields;
  return stored.map((f, index) => ({
    required: false,
    sensitive: false,
    options: [],
    ...f,
    active: true,
    order: index,
  }));
}

/** The definition to read one answer with when the layout (e.g. a table column) comes from the live form. */
export function orderFieldDefinitionFor(order: Record<string, unknown>, liveField: RequestField): RequestField {
  if (!hasStoredFormFields(order)) return liveField;
  const stored = orderFieldDefinitions(order, []);
  return stored.find((f) => f.id === liveField.id) ?? stored.find((f) => f.name === liveField.name) ?? liveField;
}

export type OrderFieldRow = {
  /** Key of the answer inside `order.fields`. */
  key: string;
  label: string;
  question: string;
  type: string;
  sensitive: boolean;
  answer: FieldAnswer;
  /** The answer's field is no longer an active field of the current request type. */
  historical: boolean;
};

/**
 * Rows for the complaint details page. Orders with `formFields` follow their stored
 * definitions; older orders keep the live-field layout. Any other stored answer is
 * appended as a historical row, so no captured answer is hidden.
 */
export function buildOrderFieldRows(
  values: Record<string, unknown>,
  liveFields: RequestField[],
  storedFormFields?: unknown,
): OrderFieldRow[] {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key);
  const live = [...liveFields]
    .filter((f) => f.active !== false && f.type !== "INSTRUCTION")
    .sort((a, b) => a.order - b.order);
  const order = { formFields: storedFormFields };
  const stored = hasStoredFormFields(order);
  const primary = stored ? orderFieldDefinitions(order, liveFields) : live;
  const isLive = (f: RequestField) => live.some((l) => l.id === f.id || (!l.id && l.name === f.name));

  const consumed = new Set<string>();
  const rows: OrderFieldRow[] = [];
  for (const f of primary) {
    consumed.add(f.name);
    consumed.add(f.id);
    const key = has(f.name) || !has(f.id) ? f.name : f.id;
    const answer = displayFieldAnswer(f, values[key]);
    const historical = stored ? !isLive(f) : false;
    if (historical && answer.kind === "empty") continue;
    rows.push({
      key,
      label: f.label || f.name,
      question: f.telegramMessage || f.label || f.name,
      type: f.type,
      sensitive: Boolean(f.sensitive),
      answer,
      historical,
    });
  }

  const formFields = asFormFields(storedFormFields);
  const definitionFor = (key: string) =>
    formFields.find((f) => f.name === key || f.id === key) ??
    liveFields.find((f) => f.name === key || f.id === key);

  const leftovers: (OrderFieldRow & { sort: number })[] = [];
  const seenDefs = new Set<string>();
  Object.keys(values).forEach((key) => {
    if (consumed.has(key)) return;
    const def = definitionFor(key);
    if (def) {
      if (consumed.has(def.name) || consumed.has(def.id) || seenDefs.has(def.id)) return;
      seenDefs.add(def.id);
    }
    const raw = values[key];
    const answer = def ? displayFieldAnswer(def as RequestField, raw) : parseFieldAnswer(raw);
    if (answer.kind === "empty") return;
    leftovers.push({
      key,
      label: def?.label || def?.name || key,
      question: def?.telegramMessage || def?.label || def?.name || key,
      type: def?.type ?? "TEXT",
      sensitive: Boolean(def?.sensitive),
      answer,
      historical: true,
      sort: def ? formFields.findIndex((f) => f.id === def.id) : -1,
    });
  });
  const rank = (sort: number) => (sort < 0 ? Number.MAX_SAFE_INTEGER : sort);
  leftovers.sort((a, b) => rank(a.sort) - rank(b.sort));
  return [...rows, ...leftovers.map(({ sort: _sort, ...row }) => row)];
}
