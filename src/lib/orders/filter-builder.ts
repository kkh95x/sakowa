import { type FilterOperator, type FieldType, type OrderFilter } from "@/types";

const TEXT_OPS: FilterOperator[] = [
  "eq",
  "neq",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
];
const NUMBER_OPS: FilterOperator[] = ["eq", "gt", "gte", "lt", "lte", "between"];
const SELECT_OPS: FilterOperator[] = ["eq", "neq"];
const DATE_OPS: FilterOperator[] = ["eq", "before", "after", "between"];
const BOOL_OPS: FilterOperator[] = ["yes", "no"];
const USERNAME_OPS: FilterOperator[] = ["contains", "eq", "starts_with", "neq"];

/** Reserved filter key: matches the Telegram username and display name, not an order field. */
export const USERNAME_FILTER_FIELD = "telegramUsername";

export function operatorsForField(type: FieldType): FilterOperator[] {
  switch (type) {
    case "NUMBER":
      return NUMBER_OPS;
    case "SELECT":
    case "RADIO":
      return SELECT_OPS;
    case "DATE":
    case "DATETIME":
      return DATE_OPS;
    case "CHECKBOX":
    case "CONFIRMATION":
      return BOOL_OPS;
    case "DYNAMIC":
    default:
      return TEXT_OPS;
  }
}

export function operatorsForFilterField(field: string, type?: FieldType): FilterOperator[] {
  if (field === USERNAME_FILTER_FIELD) return USERNAME_OPS;
  return operatorsForField(type ?? "TEXT");
}

const ALLOWED = new Set<FilterOperator>([
  ...TEXT_OPS,
  ...NUMBER_OPS,
  ...SELECT_OPS,
  ...DATE_OPS,
  ...BOOL_OPS,
]);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clause(path: string, operator: FilterOperator, value: unknown, valueTo: unknown): Record<string, unknown> | null {
  switch (operator) {
    case "eq":
      return { [path]: value };
    case "neq":
      return { [path]: { $ne: value } };
    case "contains":
      return { [path]: { $regex: escapeRegex(String(value)), $options: "i" } };
    case "not_contains":
      return { [path]: { $not: { $regex: escapeRegex(String(value)), $options: "i" } } };
    case "starts_with":
      return { [path]: { $regex: `^${escapeRegex(String(value))}`, $options: "i" } };
    case "ends_with":
      return { [path]: { $regex: `${escapeRegex(String(value))}$`, $options: "i" } };
    case "gt":
      return { [path]: { $gt: Number(value) } };
    case "gte":
      return { [path]: { $gte: Number(value) } };
    case "lt":
      return { [path]: { $lt: Number(value) } };
    case "lte":
      return { [path]: { $lte: Number(value) } };
    case "between":
      return { [path]: { $gte: Number(value), $lte: Number(valueTo) } };
    case "before":
      return { [path]: { $lt: value } };
    case "after":
      return { [path]: { $gt: value } };
    case "yes":
      return { [path]: true };
    case "no":
      return { [path]: false };
    default:
      return null;
  }
}

function matchPaths(field: string, type: FieldType | undefined) {
  if (field === USERNAME_FILTER_FIELD) return ["telegramUsername", "telegramName"];
  const path = `fields.${field}`;
  if (type === "DYNAMIC") return [path, `${path}.text`, `${path}.transcript.text`, `${path}.filename`];
  return [path];
}

export class OrderFilterBuilder {
  static build(
    filters: OrderFilter[],
    fields: { name: string; type: FieldType }[] = [],
  ): Record<string, unknown> {
    const types = new Map(fields.map((field) => [field.name, field.type]));
    const and: Record<string, unknown>[] = [];
    for (const filter of filters) {
      if (!ALLOWED.has(filter.operator)) continue;
      if (filter.field !== USERNAME_FILTER_FIELD && (filter.field.includes("$") || filter.field.includes("."))) continue;
      const value =
        filter.field === USERNAME_FILTER_FIELD && typeof filter.value === "string"
          ? filter.value.trim().replace(/^@+/, "")
          : filter.value;
      const paths = matchPaths(filter.field, types.get(filter.field));
      const parts = paths
        .map((path) => clause(path, filter.operator, value, filter.valueTo))
        .filter((part): part is Record<string, unknown> => Boolean(part));
      if (!parts.length) continue;
      const negative = filter.operator === "neq" || filter.operator === "not_contains";
      and.push(parts.length === 1 ? parts[0] : negative ? { $and: parts } : { $or: parts });
    }
    return and.length ? { $and: and } : {};
  }
}
