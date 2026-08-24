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
    default:
      return TEXT_OPS;
  }
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

export class OrderFilterBuilder {
  static build(filters: OrderFilter[]): Record<string, unknown> {
    const and: Record<string, unknown>[] = [];
    for (const filter of filters) {
      if (!ALLOWED.has(filter.operator)) continue;
      if (filter.field.includes("$") || filter.field.includes(".")) continue;
      const path = `fields.${filter.field}`;
      const value = filter.value;
      switch (filter.operator) {
        case "eq":
          and.push({ [path]: value });
          break;
        case "neq":
          and.push({ [path]: { $ne: value } });
          break;
        case "contains":
          and.push({ [path]: { $regex: escapeRegex(String(value)), $options: "i" } });
          break;
        case "not_contains":
          and.push({ [path]: { $not: { $regex: escapeRegex(String(value)), $options: "i" } } });
          break;
        case "starts_with":
          and.push({ [path]: { $regex: `^${escapeRegex(String(value))}`, $options: "i" } });
          break;
        case "ends_with":
          and.push({ [path]: { $regex: `${escapeRegex(String(value))}$`, $options: "i" } });
          break;
        case "gt":
          and.push({ [path]: { $gt: Number(value) } });
          break;
        case "gte":
          and.push({ [path]: { $gte: Number(value) } });
          break;
        case "lt":
          and.push({ [path]: { $lt: Number(value) } });
          break;
        case "lte":
          and.push({ [path]: { $lte: Number(value) } });
          break;
        case "between":
          and.push({ [path]: { $gte: Number(value), $lte: Number(filter.valueTo) } });
          break;
        case "before":
          and.push({ [path]: { $lt: value } });
          break;
        case "after":
          and.push({ [path]: { $gt: value } });
          break;
        case "yes":
          and.push({ [path]: true });
          break;
        case "no":
          and.push({ [path]: false });
          break;
        default:
          break;
      }
    }
    return and.length ? { $and: and } : {};
  }
}
