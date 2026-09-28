import type { RequestField } from "@/types";

export const BRANCH_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "is_empty",
  "is_not_empty",
] as const;

export const BRANCH_ACTIONS = ["show", "hide", "goto"] as const;

export type BranchOperator = (typeof BRANCH_OPERATORS)[number];
export type BranchAction = (typeof BRANCH_ACTIONS)[number];

export interface BranchingRule {
  id: string;
  sourceFieldId: string;
  operator: BranchOperator;
  value?: string;
  action: BranchAction;
  targetFieldId: string;
}

export type BranchingValidationError = {
  code: string;
  message: string;
  ruleId?: string;
};

function fieldById(fields: RequestField[], id: string) {
  return fields.find((f) => f.id === id || f.name === id) ?? null;
}

function optionValues(field: RequestField) {
  return new Set((field.options ?? []).map((o) => String(o.value)));
}

function optionLabels(field: RequestField) {
  return new Set((field.options ?? []).map((o) => String(o.label)));
}

export function canonicalChoiceValue(field: RequestField, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "boolean") return raw ? "true" : "false";
  if (typeof raw === "object") {
    const meta = raw as { contentType?: string; text?: string | null; value?: unknown };
    if (meta.text != null && String(meta.text).trim()) return String(meta.text);
    if (meta.value != null) return String(meta.value);
    if (meta.contentType) return String(meta.contentType);
    return JSON.stringify(raw);
  }
  const text = String(raw);
  const opt = field.options?.find((o) => o.value === text || o.label === text);
  return opt?.value ?? text;
}

function asList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item));
  if (raw === undefined || raw === null || raw === "") return [];
  return [String(raw)];
}

function isEmptyAnswer(raw: unknown) {
  if (raw === undefined || raw === null || raw === "") return true;
  if (Array.isArray(raw)) return raw.length === 0;
  if (typeof raw === "object") {
    const meta = raw as {
      text?: string | null;
      fileId?: string | null;
      storageId?: string | null;
      telegramFileId?: string | null;
      gridFsId?: string | null;
      contentType?: string;
      metadata?: Record<string, unknown>;
    };
    if (meta.text && String(meta.text).trim()) return false;
    if (meta.fileId || meta.storageId || meta.telegramFileId || meta.gridFsId) return false;
    if (meta.contentType === "location" || meta.contentType === "contact") return false;
    if (meta.metadata && Object.keys(meta.metadata).length) return false;
    return true;
  }
  return false;
}

export function readAnswer(
  answers: Record<string, unknown>,
  field: { id: string; name: string },
) {
  if (Object.prototype.hasOwnProperty.call(answers, field.id)) return answers[field.id];
  return answers[field.name];
}

function confirmationEquals(raw: unknown, expected: string) {
  const yes = raw === true || raw === "true" || raw === "نعم" || /^yes$/i.test(String(raw));
  const no = raw === false || raw === "false" || raw === "لا" || /^no$/i.test(String(raw));
  const wantYes = expected === "true" || expected === "نعم" || /^yes$/i.test(expected);
  const wantNo = expected === "false" || expected === "لا" || /^no$/i.test(expected);
  if (wantYes) return yes;
  if (wantNo) return no;
  return String(raw) === expected;
}

export function matchCondition(
  field: RequestField,
  answer: unknown,
  operator: BranchOperator,
  expected?: string,
): boolean {
  if (operator === "is_empty") return isEmptyAnswer(answer);
  if (operator === "is_not_empty") return !isEmptyAnswer(answer);

  const value = expected ?? "";
  if (field.type === "CONFIRMATION") {
    const equals = confirmationEquals(answer, value);
    return operator === "equals" ? equals : operator === "not_equals" ? !equals : String(answer ?? "").includes(value);
  }

  if (field.type === "CHECKBOX") {
    const list = asList(answer).map((item) => canonicalChoiceValue(field, item) ?? item);
    const needle = canonicalChoiceValue(field, value) ?? value;
    if (operator === "equals") return list.includes(needle);
    if (operator === "not_equals") return !list.includes(needle);
    if (operator === "contains") return list.some((item) => item.includes(needle));
  }

  const canonical = canonicalChoiceValue(field, answer) ?? "";
  const expectedCanonical = canonicalChoiceValue(field, value) ?? value;
  if (operator === "equals") return canonical === expectedCanonical;
  if (operator === "not_equals") return canonical !== expectedCanonical;
  if (operator === "contains") return canonical.toLowerCase().includes(expectedCanonical.toLowerCase());
  return false;
}

export function ruleMatches(
  rule: BranchingRule,
  fields: RequestField[],
  answers: Record<string, unknown>,
) {
  const source = fieldById(fields, rule.sourceFieldId);
  if (!source) return false;
  return matchCondition(source, readAnswer(answers, source), rule.operator, rule.value);
}

export function visibleFieldIds(
  fields: RequestField[],
  rules: BranchingRule[],
  answers: Record<string, unknown>,
): Set<string> {
  const active = fields.filter((f) => f.active !== false);
  const showTargets = new Set(
    rules.filter((r) => r.action === "show").map((r) => r.targetFieldId),
  );
  const visible = new Set<string>();
  for (const field of active) {
    if (showTargets.has(field.id)) continue;
    visible.add(field.id);
  }
  for (const rule of rules) {
    if (rule.action !== "show") continue;
    if (!ruleMatches(rule, active, answers)) continue;
    const target = fieldById(active, rule.targetFieldId);
    if (target) visible.add(target.id);
  }
  for (const rule of rules) {
    if (rule.action !== "hide") continue;
    if (!ruleMatches(rule, active, answers)) continue;
    const target = fieldById(active, rule.targetFieldId);
    if (target) visible.delete(target.id);
  }
  return visible;
}

export function visibleFields(
  fields: RequestField[],
  rules: BranchingRule[],
  answers: Record<string, unknown>,
) {
  const visible = visibleFieldIds(fields, rules, answers);
  return [...fields]
    .filter((f) => f.active !== false && visible.has(f.id))
    .sort((a, b) => a.order - b.order);
}

export function pruneHiddenAnswers(
  fields: RequestField[],
  rules: BranchingRule[],
  answers: Record<string, unknown>,
) {
  const visible = visibleFieldIds(fields, rules, answers);
  const next = { ...answers };
  for (const field of fields) {
    if (field.type === "INSTRUCTION") continue;
    if (visible.has(field.id)) continue;
    delete next[field.id];
    delete next[field.name];
  }
  return next;
}

export function gotoTargetId(
  field: RequestField,
  rules: BranchingRule[],
  fields: RequestField[],
  answers: Record<string, unknown>,
) {
  const visible = visibleFieldIds(fields, rules, answers);
  for (const rule of rules) {
    if (rule.action !== "goto") continue;
    if (rule.sourceFieldId !== field.id && rule.sourceFieldId !== field.name) continue;
    if (!ruleMatches(rule, fields, answers)) continue;
    const target = fieldById(fields, rule.targetFieldId);
    if (target && visible.has(target.id)) return target.id;
  }
  return null;
}

export function nextAskIndex(
  fields: RequestField[],
  rules: BranchingRule[],
  answers: Record<string, unknown>,
  fromIndex: number,
) {
  const visible = visibleFieldIds(fields, rules, answers);
  const current = fromIndex >= 0 ? fields[fromIndex] : null;
  if (current) {
    const jump = gotoTargetId(current, rules, fields, answers);
    if (jump) {
      const ti = fields.findIndex((f) => f.id === jump);
      if (ti >= 0) return ti;
    }
  }
  for (let i = fromIndex + 1; i < fields.length; i += 1) {
    const field = fields[i];
    if (!field || !visible.has(field.id)) continue;
    return i;
  }
  return fields.length;
}

function hasCycle(edges: Map<string, Set<string>>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of edges.keys()) {
    if (walk(node)) return true;
  }
  return false;
}

export function validateBranchingConfig(
  fields: RequestField[],
  rules: BranchingRule[],
): BranchingValidationError[] {
  const errors: BranchingValidationError[] = [];
  const ids = new Set(fields.map((f) => f.id));
  const showEdges = new Map<string, Set<string>>();
  const gotoEdges = new Map<string, Set<string>>();

  for (const rule of rules) {
    if (!BRANCH_OPERATORS.includes(rule.operator)) {
      errors.push({ code: "INVALID_OPERATOR", message: "معامل الشرط غير صالح.", ruleId: rule.id });
    }
    if (!BRANCH_ACTIONS.includes(rule.action)) {
      errors.push({ code: "INVALID_ACTION", message: "إجراء الشرط غير صالح.", ruleId: rule.id });
    }
    const source = fieldById(fields, rule.sourceFieldId);
    const target = fieldById(fields, rule.targetFieldId);
    if (!source || !ids.has(source.id)) {
      errors.push({
        code: "MISSING_SOURCE",
        message: "شرط يشير إلى حقل مصدر غير موجود.",
        ruleId: rule.id,
      });
      continue;
    }
    if (!target || !ids.has(target.id)) {
      errors.push({
        code: "MISSING_TARGET",
        message: "شرط يشير إلى حقل هدف غير موجود.",
        ruleId: rule.id,
      });
      continue;
    }
    if (source.id === target.id) {
      errors.push({
        code: "SELF_TARGET",
        message: "لا يمكن أن يكون الحقل مصدراً وهدفاً لنفس الشرط.",
        ruleId: rule.id,
      });
    }
    if (
      (rule.operator === "equals" || rule.operator === "not_equals" || rule.operator === "contains") &&
      (rule.value == null || String(rule.value).trim() === "")
    ) {
      errors.push({
        code: "MISSING_VALUE",
        message: "قيمة الشرط مطلوبة لهذا المعامل.",
        ruleId: rule.id,
      });
    }
    if (
      (source.type === "SELECT" || source.type === "RADIO") &&
      (rule.operator === "equals" || rule.operator === "not_equals") &&
      rule.value != null &&
      String(rule.value).trim() !== ""
    ) {
      const values = optionValues(source);
      const labels = optionLabels(source);
      if (!values.has(String(rule.value)) && !labels.has(String(rule.value))) {
        errors.push({
          code: "INVALID_OPTION",
          message: "قيمة الشرط لا تطابق خياراً موجوداً.",
          ruleId: rule.id,
        });
      }
    }
    if (rule.action === "goto" && target.order <= source.order) {
      errors.push({
        code: "BACKWARD_GOTO",
        message: "الانتقال يجب أن يكون إلى سؤال لاحق فقط.",
        ruleId: rule.id,
      });
    }
    if (rule.action === "show") {
      if (!showEdges.has(source.id)) showEdges.set(source.id, new Set());
      showEdges.get(source.id)!.add(target.id);
    }
    if (rule.action === "goto") {
      if (!gotoEdges.has(source.id)) gotoEdges.set(source.id, new Set());
      gotoEdges.get(source.id)!.add(target.id);
    }
  }

  if (hasCycle(showEdges)) {
    errors.push({
      code: "SHOW_CYCLE",
      message: "قواعد الإظهار تشكل حلقة دائرية.",
    });
  }
  if (hasCycle(gotoEdges)) {
    errors.push({
      code: "GOTO_CYCLE",
      message: "قواعد الانتقال تشكل حلقة دائرية.",
    });
  }
  return errors;
}

export function validateVisibleAnswers(params: {
  fields: RequestField[];
  rules: BranchingRule[];
  answers: Record<string, unknown>;
}) {
  const visible = visibleFields(params.fields, params.rules, params.answers);
  const pruned = pruneHiddenAnswers(params.fields, params.rules, params.answers);
  for (const field of visible) {
    if (field.type === "INSTRUCTION") continue;
    if (!field.required) continue;
    if (isEmptyAnswer(readAnswer(pruned, field))) {
      return {
        ok: false as const,
        error: `FIELD_REQUIRED:${field.label || field.name}`,
        answers: pruned,
      };
    }
  }
  return { ok: true as const, answers: pruned };
}

export class BranchingEngine {
  static evaluate(params: {
    fields: RequestField[];
    rules: BranchingRule[];
    answers: Record<string, unknown>;
    currentField?: RequestField | null;
  }) {
    const visible = visibleFields(params.fields, params.rules, params.answers);
    const visibleIds = new Set(visible.map((f) => f.id));
    const required = new Set(
      visible.filter((f) => f.required && f.type !== "INSTRUCTION").map((f) => f.id),
    );
    const currentIndex = params.currentField
      ? params.fields.findIndex((f) => f.id === params.currentField?.id)
      : -1;
    const nextIndex = nextAskIndex(params.fields, params.rules, params.answers, currentIndex);
    const nextField = params.fields[nextIndex] ?? null;
    return {
      visible,
      visibleIds,
      requiredIds: required,
      nextField: nextField && visibleIds.has(nextField.id) ? nextField : nextField,
      nextIndex,
      answers: pruneHiddenAnswers(params.fields, params.rules, params.answers),
    };
  }
}
