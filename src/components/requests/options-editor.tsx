"use client";

import { useState } from "react";
import { Check, KeyRound, Plus, Trash2, X } from "lucide-react";
import { ar } from "@/i18n/ar";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input } from "@/components/ui/input";
import type { BranchingRule } from "@/lib/requests/branching";
import {
  addOption,
  changeOptionValue,
  optionValueError,
  removeOption,
  renameOption,
  rulesUsingOption,
  type FieldOption,
} from "@/lib/requests/field-options";
import type { RequestField } from "@/types";

export function OptionsEditor({
  field,
  rules = [],
  onChange,
}: {
  field: Pick<RequestField, "id" | "name" | "options">;
  rules?: BranchingRule[];
  onChange: (options: FieldOption[]) => void;
}) {
  const options = field.options ?? [];
  const [editingValue, setEditingValue] = useState<{ index: number; draft: string } | null>(null);
  const valueError = editingValue ? optionValueError(options, editingValue.index, editingValue.draft) : null;

  function commitValue() {
    if (!editingValue) return;
    const next = changeOptionValue(options, editingValue.index, editingValue.draft);
    if (!next) return;
    onChange(next);
    setEditingValue(null);
  }

  return (
    <div className="space-y-2">
      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          {ar.noOptions}
        </p>
      ) : (
        <ol className="space-y-2">
          {options.map((opt, index) => {
            const usedBy = rulesUsingOption(rules, field, opt);
            const isEditingValue = editingValue?.index === index;
            const inputId = `opt-${field.id}-${index}`;
            return (
              <li key={`${opt.value}-${index}`} className="rounded-xl border border-border bg-muted/20 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    id={inputId}
                    aria-label={ar.optionLabel.replace("{n}", String(index + 1))}
                    value={opt.label}
                    onChange={(e) => onChange(renameOption(options, index, e.target.value))}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="danger-ghost"
                    size="icon-sm"
                    aria-label={ar.removeOption}
                    title={usedBy ? ar.optionUsedByRules.replace("{count}", String(usedBy)) : ar.removeOption}
                    disabled={usedBy > 0}
                    onClick={() => {
                      onChange(removeOption(options, index));
                      setEditingValue(null);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 ps-9 text-xs text-muted-foreground">
                  <span>{ar.optionValue}:</span>
                  {isEditingValue ? (
                    <>
                      <Input
                        dir="ltr"
                        aria-label={ar.optionValue}
                        aria-invalid={Boolean(valueError)}
                        autoFocus
                        value={editingValue.draft}
                        onChange={(e) => setEditingValue({ index, draft: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitValue();
                          }
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingValue(null);
                          }
                        }}
                        className="h-8 w-40 text-start font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={ar.confirmOptionValue}
                        disabled={Boolean(valueError)}
                        onClick={commitValue}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={ar.cancelOptionValue}
                        onClick={() => setEditingValue(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <code dir="ltr" className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {opt.value}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={usedBy > 0}
                        title={usedBy ? ar.optionUsedByRules.replace("{count}", String(usedBy)) : undefined}
                        onClick={() => setEditingValue({ index, draft: opt.value })}
                      >
                        <KeyRound className="size-3.5" />
                        {ar.changeOptionValue}
                      </Button>
                    </>
                  )}
                </div>
                {isEditingValue ? (
                  <div className="ps-9">
                    <FieldError>{valueError}</FieldError>
                    {!valueError ? <FieldHint>{ar.optionValueWarning}</FieldHint> : null}
                  </div>
                ) : usedBy ? (
                  <p className="mt-1.5 ps-9 text-xs text-info">
                    {ar.optionUsedByRules.replace("{count}", String(usedBy))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldHint>{ar.optionsEditorHint}</FieldHint>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(addOption(options))}>
          <Plus className="size-3.5" />
          {ar.addOption}
        </Button>
      </div>
    </div>
  );
}
