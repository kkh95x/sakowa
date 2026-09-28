import type { BranchingRule } from "@/lib/requests/branching";
import type { RequestField } from "@/types";

export type FieldOption = { value: string; label: string };

/**
 * `value` is the stable identifier stored in answers and matched by branching rules;
 * `label` is display text only. Editing a label never touches the value.
 */
export function renameOption(options: FieldOption[], index: number, label: string): FieldOption[] {
  return options.map((opt, i) => (i === index ? { ...opt, label } : opt));
}

export function uniqueOptionValue(options: FieldOption[]): string {
  const used = new Set(options.map((o) => o.value));
  let n = options.length + 1;
  while (used.has(`option_${n}`)) n += 1;
  return `option_${n}`;
}

export function addOption(options: FieldOption[], label?: string): FieldOption[] {
  return [...options, { value: uniqueOptionValue(options), label: label ?? `خيار ${options.length + 1}` }];
}

export function removeOption(options: FieldOption[], index: number): FieldOption[] {
  return options.filter((_, i) => i !== index);
}

export function optionValueError(options: FieldOption[], index: number, value: string): string | null {
  const next = value.trim();
  if (!next) return "المعرّف الداخلي مطلوب.";
  if (options.some((o, i) => i !== index && o.value === next)) return "هذا المعرّف مستخدم لخيار آخر.";
  return null;
}

/** Deliberate change of the internal identifier; returns null when the new value is invalid. */
export function changeOptionValue(options: FieldOption[], index: number, value: string): FieldOption[] | null {
  if (optionValueError(options, index, value)) return null;
  return options.map((opt, i) => (i === index ? { ...opt, value: value.trim() } : opt));
}

export function rulesUsingOption(
  rules: BranchingRule[],
  field: Pick<RequestField, "id" | "name">,
  option: FieldOption,
): number {
  return rules.filter(
    (r) =>
      (r.sourceFieldId === field.id || r.sourceFieldId === field.name) &&
      r.value != null &&
      (r.value === option.value || r.value === option.label),
  ).length;
}

/** Server-side normalization: trims text, keeps stored values, fills a missing value from the label. */
export function normalizeOptions(options: FieldOption[] | undefined): FieldOption[] {
  return (options ?? [])
    .map((o) => {
      const label = String(o.label ?? "").trim();
      const value = String(o.value ?? "").trim() || label;
      return { value, label };
    })
    .filter((o) => o.label || o.value);
}

export function duplicateOptionValue(options: FieldOption[]): string | null {
  const seen = new Set<string>();
  for (const o of options) {
    if (seen.has(o.value)) return o.value;
    seen.add(o.value);
  }
  return null;
}
