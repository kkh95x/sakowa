"use client";

import { GitBranch, Plus, Trash2 } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardHeader } from "@/components/ui/card";
import type { BranchAction, BranchOperator, RequestField } from "@/types";
import type { BranchingRule } from "@/lib/requests/branching";

const OPERATORS: { value: BranchOperator; label: string }[] = [
  { value: "equals", label: ar.equals },
  { value: "not_equals", label: ar.notEquals },
  { value: "contains", label: ar.operators.contains },
  { value: "is_empty", label: ar.isEmpty },
  { value: "is_not_empty", label: ar.isNotEmpty },
];

const ACTIONS: { value: BranchAction; label: string }[] = [
  { value: "show", label: ar.showField },
  { value: "hide", label: ar.hideField },
  { value: "goto", label: ar.gotoField },
];

export function BranchingRulesEditor({
  fields,
  rules,
  onChange,
}: {
  fields: RequestField[];
  rules: BranchingRule[];
  onChange: (rules: BranchingRule[]) => void;
}) {
  const usable = fields.filter((f) => f.active !== false && f.type !== "INSTRUCTION");

  function update(index: number, patch: Partial<BranchingRule>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function addRule() {
    const source = usable[0];
    const target = usable[1] ?? usable[0];
    if (!source || !target) return;
    onChange([
      ...rules,
      {
        id: crypto.randomUUID(),
        sourceFieldId: source.id,
        operator: "equals",
        value: source.options?.[0]?.value ?? "نعم",
        action: "show",
        targetFieldId: target.id,
      },
    ]);
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      <CardHeader
        icon={<GitBranch />}
        title={
          <>
            {ar.branching}
            {rules.length ? (
              <span className="ms-1.5 text-xs font-normal text-muted-foreground tabular-nums">({rules.length})</span>
            ) : null}
          </>
        }
        description={ar.branchingHint}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={addRule} disabled={usable.length < 2}>
            <Plus className="size-3.5" />
            {ar.addBranchRule}
          </Button>
        }
      />
      <div className="space-y-2.5 p-3">
        {rules.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {usable.length < 2 ? ar.branchingNeedsFields : ar.noBranchRules}
          </p>
        ) : null}
        {rules.map((rule, index) => {
          const source = usable.find((f) => f.id === rule.sourceFieldId);
          const idp = `rule-${rule.id || index}`;
          return (
            <div key={rule.id || index} className="rounded-xl border border-border bg-muted/25">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  {ar.ruleN.replace("{n}", String(index + 1))}
                </span>
                <Button
                  type="button"
                  variant="danger-ghost"
                  size="icon-sm"
                  aria-label={ar.removeRule}
                  title={ar.removeRule}
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${idp}-source`}>{ar.sourceField}</Label>
                  <Select
                    id={`${idp}-source`}
                    value={rule.sourceFieldId}
                    onChange={(e) => update(index, { sourceFieldId: e.target.value })}
                  >
                    {usable.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`${idp}-operator`}>{ar.branchOperator}</Label>
                  <Select
                    id={`${idp}-operator`}
                    value={rule.operator}
                    onChange={(e) => update(index, { operator: e.target.value as BranchOperator })}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" ? (
                  <div>
                    <Label htmlFor={`${idp}-value`}>{ar.branchValue}</Label>
                    {source?.options?.length ? (
                      <Select
                        id={`${idp}-value`}
                        value={rule.value ?? ""}
                        onChange={(e) => update(index, { value: e.target.value })}
                      >
                        {source.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    ) : source?.type === "CONFIRMATION" ? (
                      <Select
                        id={`${idp}-value`}
                        value={rule.value ?? "true"}
                        onChange={(e) => update(index, { value: e.target.value })}
                      >
                        <option value="true">{ar.operators.yes}</option>
                        <option value="false">{ar.operators.no}</option>
                      </Select>
                    ) : (
                      <Input
                        id={`${idp}-value`}
                        value={rule.value ?? ""}
                        onChange={(e) => update(index, { value: e.target.value })}
                      />
                    )}
                  </div>
                ) : null}
                <div>
                  <Label htmlFor={`${idp}-action`}>{ar.branchAction}</Label>
                  <Select
                    id={`${idp}-action`}
                    value={rule.action}
                    onChange={(e) => update(index, { action: e.target.value as BranchAction })}
                  >
                    {ACTIONS.map((action) => (
                      <option key={action.value} value={action.value}>
                        {action.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`${idp}-target`}>{ar.targetField}</Label>
                  <Select
                    id={`${idp}-target`}
                    value={rule.targetFieldId}
                    onChange={(e) => update(index, { targetFieldId: e.target.value })}
                  >
                    {usable
                      .filter((f) => f.id !== rule.sourceFieldId)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
