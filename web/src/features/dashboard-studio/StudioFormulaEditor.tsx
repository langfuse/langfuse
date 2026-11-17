import { useId } from "react";
import { type StudioWidgetConfig } from "@langfuse/shared";
import { BracesIcon, TrashIcon } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  evaluateStudioFormula,
  studioFormulaReferences,
} from "@/src/features/dashboard/lib/studioExpressions";

export function StudioFormulaEditor({
  expression,
  references,
  onChange,
  onRemove,
}: StudioFormulaEditorProps) {
  const errorId = useId();
  const formulaError = (() => {
    try {
      evaluateStudioFormula(
        expression.formula,
        new Map(references.map((reference) => [reference, { value: null }])),
      );
      return studioFormulaReferences(expression.formula).length
        ? null
        : "Reference a query metric or an earlier formula.";
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Invalid arithmetic expression";
    }
  })();
  return (
    <div className="bg-background flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <BracesIcon color="tertiary" aria-hidden />
        <span className="text-muted-foreground font-mono text-xs">
          {expression.id}
        </span>
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Formula name"
            value={expression.label}
            onChange={(event) =>
              onChange({ ...expression, label: event.target.value })
            }
          />
        </div>
        <IconButton
          label="Remove formula"
          icon={TrashIcon}
          size="sm"
          onClick={onRemove}
        />
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_10rem]">
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          Expression
          <Input
            aria-label="Formula"
            aria-describedby={formulaError ? errorId : undefined}
            aria-invalid={Boolean(formulaError)}
            error={Boolean(formulaError)}
            value={expression.formula}
            placeholder="a.count / b.count"
            onChange={(event) =>
              onChange({ ...expression, formula: event.target.value })
            }
          />
          {formulaError ? (
            <span id={errorId} role="alert" className="text-destructive">
              {formulaError}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Format
          <SelectInput
            aria-label="Formula format"
            placeholder="Number"
            value={expression.unit ?? "number"}
            options={[
              { value: "number", label: "Number" },
              { value: "percent", label: "Percent (0–1)" },
              { value: "USD", label: "US dollars" },
            ]}
            onValueChange={(unit) =>
              onChange({
                ...expression,
                unit: unit === "number" ? undefined : unit,
              })
            }
          />
        </label>
      </div>
      <p className="text-muted-foreground text-xs break-words">
        References: <span className="font-mono">{references.join(", ")}</span>
      </p>
    </div>
  );
}

type StudioFormulaEditorProps = {
  expression: StudioWidgetConfig["expressions"][number];
  references: string[];
  onChange: (expression: StudioWidgetConfig["expressions"][number]) => void;
  onRemove: () => void;
};
