import { useId, useRef, useState } from "react";
import { type StudioWidgetConfig } from "@langfuse/shared";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  TrashIcon,
} from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { InlineEditText } from "@/src/components/design-system/InlineEditText/InlineEditText";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { StudioInlineSelect } from "./StudioInlineSelect";
import { studioFormulaReferences } from "../dashboard/lib/studioExpressions";
import {
  displayStudioFormula,
  lowerStudioFormula,
  studioAuthoringError,
  type StudioFormulaOperand,
} from "./studioFormulaAuthoring";

export function StudioFormulaEditor({
  expression,
  operands,
  letter,
  expanded = true,
  onExpandedChange,
  onChange,
  onRemove,
  onCommit,
  isolationActive,
  onIsolationChange,
}: StudioFormulaEditorProps) {
  const errorId = useId();
  const bodyId = useId();
  const formulaId = useId();
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef<{ initial: string; latest: string } | null>(null);
  const hasFocusedInput = useRef(false);
  const commit = () => {
    const edited = editing.current;
    editing.current = null;
    if (edited && edited.initial !== edited.latest) onCommit?.();
  };
  const referenced = studioFormulaReferences(expression.formula);
  const [numeratorRef, setNumeratorRef] = useState(
    referenced[0] ?? operands[0]?.reference,
  );
  const [denominatorRef, setDenominatorRef] = useState(
    referenced[1] ?? operands[1]?.reference ?? operands[0]?.reference,
  );
  const numerator =
    operands.find((operand) => operand.reference === numeratorRef) ??
    operands[0];
  const denominator =
    operands.find((operand) => operand.reference === denominatorRef) ??
    operands[1] ??
    operands[0];
  const formulaError = studioAuthoringError(expression.formula, operands);
  const formula = displayStudioFormula(expression.formula, operands);
  const metricOptions = operands.map((operand) => ({
    value: operand.reference,
    label: `${operand.token} · ${operand.label}${operand.hidden ? " (hidden in chart)" : ""}`,
  }));
  const replaceWithRatio = (percent: boolean) => {
    if (!numerator || !denominator) return;
    onChange({
      ...expression,
      formula: `${numerator.reference} / ${denominator.reference}`,
      unit: percent ? "percent" : undefined,
    });
  };
  const unitsMatch = numerator?.unit === denominator?.unit;
  return (
    <section
      className={`ph-no-capture group/series min-w-0 rounded-md ${expanded ? "bg-muted/40" : "hover:bg-muted/50"}`}
      aria-label={`Computed series ${letter}`}
    >
      <div className="flex min-w-0 items-center gap-1 px-1.5 pt-2 pb-1">
        {onExpandedChange ? (
          <IconButton
            label={`${expanded ? "Collapse" : "Expand"} computed series ${letter}`}
            icon={expanded ? ChevronDown : ChevronRight}
            size="sm"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => onExpandedChange(!expanded)}
          />
        ) : null}
        <span
          className="bg-foreground/7 text-foreground-secondary flex size-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold"
          aria-label={`Series ${letter}`}
        >
          {letter}
        </span>
        <div className="min-w-0 flex-1 text-sm font-medium">
          <InlineEditText
            aria-label="Formula name"
            value={expression.label}
            placeholder="Formula name"
            onSave={(label) => onChange({ ...expression, label })}
          />
        </div>
        <IconButton
          label={
            expression.hidden
              ? "Show computed series in chart"
              : "Hide computed series from chart"
          }
          icon={expression.hidden ? EyeOff : Eye}
          size="sm"
          aria-pressed={Boolean(expression.hidden)}
          onClick={() =>
            onChange({ ...expression, hidden: !expression.hidden })
          }
        />
        <div className="pointer-fine:opacity-0 pointer-fine:group-focus-within/series:opacity-100 pointer-fine:group-hover/series:opacity-100">
          <IconButton
            label="Remove formula"
            icon={TrashIcon}
            size="sm"
            onClick={onRemove}
          />
        </div>
      </div>
      {!expanded ? (
        <p className="text-muted-foreground pr-2 pb-2 pl-10 text-xs leading-relaxed break-words">
          <code>{formula || "Choose a formula"}</code>
          {formulaError ? (
            <span className="text-destructive"> · Needs attention</span>
          ) : null}
        </p>
      ) : null}
      <div
        id={bodyId}
        className={`${expanded ? "flex" : "hidden"} min-w-0 flex-col gap-2.5 px-3.5 pt-2 pb-4`}
      >
        <div className="flex min-w-0 flex-col gap-0.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={formulaId}>Formula</label>
            <StudioInlineSelect
              label="Insert metric into formula"
              placeholder="Insert series"
              value=""
              options={metricOptions}
              onValueChange={(reference) => {
                const operand = operands.find(
                  (item) => item.reference === reference,
                );
                if (!operand) return;
                const start = hasFocusedInput.current
                  ? (input.current?.selectionStart ?? formula.length)
                  : formula.length;
                const end = input.current?.selectionEnd ?? start;
                const next =
                  formula.slice(0, start) + operand.token + formula.slice(end);
                onChange({
                  ...expression,
                  formula: lowerStudioFormula(next, operands),
                });
                input.current?.focus();
              }}
            />
          </div>
          <Input
            id={formulaId}
            ref={input}
            aria-label="Formula"
            aria-describedby={formulaError ? errorId : undefined}
            aria-invalid={Boolean(formulaError)}
            error={Boolean(formulaError)}
            value={formula}
            placeholder="A / B"
            onFocus={() => {
              hasFocusedInput.current = true;
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            onChange={(event) => {
              const next = lowerStudioFormula(event.target.value, operands);
              editing.current = {
                initial: editing.current?.initial ?? expression.formula,
                latest: next,
              };
              onChange({
                ...expression,
                formula: next,
              });
            }}
          />
        </div>
        {formulaError ? (
          <p id={errorId} role="alert" className="text-destructive text-xs">
            {formulaError}
          </p>
        ) : null}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">Display as</span>
          <div className="min-w-0 flex-1">
            <StudioInlineSelect
              label="Formula format"
              placeholder="Number"
              value={expression.unit ?? "number"}
              options={[
                { value: "number", label: "Number" },
                { value: "percent", label: "Percentage (fraction 0–1)" },
                { value: "USD", label: "US dollars" },
                ...(expression.unit &&
                !["number", "percent", "USD"].includes(expression.unit)
                  ? [{ value: expression.unit, label: expression.unit }]
                  : []),
              ]}
              onValueChange={(unit) =>
                onChange({
                  ...expression,
                  unit: unit === "number" ? undefined : unit,
                })
              }
            />
          </div>
        </div>
        {onIsolationChange ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              text={
                isolationActive ? "Restore visibility" : "Plot formula only"
              }
              variant="secondary"
              size="sm"
              onClick={onIsolationChange}
            />
            <span className="text-muted-foreground text-xs">
              Inputs stay available in Data.
            </span>
          </div>
        ) : null}
        {expression.unit === "percent" || expression.unit === "%" ? (
          <p className="text-muted-foreground text-xs">
            A fraction of 0.125 displays as 12.5%.
          </p>
        ) : null}
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer py-1">
            Ratio or percentage
          </summary>
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-muted-foreground">
              Choose the numerator and denominator. These shortcuts replace this
              expression.
            </p>
            <label className="flex flex-col gap-1">
              Numerator
              <SelectInput
                noCapture
                aria-label="Formula numerator"
                placeholder="Choose a metric"
                value={numerator?.reference ?? ""}
                options={metricOptions}
                onValueChange={setNumeratorRef}
              />
            </label>
            <label className="flex flex-col gap-1">
              Denominator
              <SelectInput
                noCapture
                aria-label="Formula denominator"
                placeholder="Choose a metric"
                value={denominator?.reference ?? ""}
                options={metricOptions}
                onValueChange={setDenominatorRef}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                text="Use ratio"
                variant="secondary"
                size="sm"
                disabled={!numerator || !denominator}
                onClick={() => replaceWithRatio(false)}
              />
              <Button
                text="Use percentage"
                variant="secondary"
                size="sm"
                disabled={!numerator || !denominator || !unitsMatch}
                onClick={() => replaceWithRatio(true)}
              />
            </div>
            {!unitsMatch ? (
              <p className="text-muted-foreground">
                A percentage needs numerator and denominator with the same unit.
              </p>
            ) : null}
            <p className="text-muted-foreground">
              For an error rate, divide failed requests by all requests. Inputs
              may be hidden from the chart and remain available in Data.
            </p>
          </div>
        </details>
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer py-1">
            Metric references and arithmetic
          </summary>
          <div className="flex flex-col gap-1 pt-1">
            <p>
              Use +, −, *, / and parentheses. Select a metric when a series
              contains more than one. Earlier computed series can be reused.
            </p>
            {operands.map((operand) => (
              <p key={operand.reference} className="break-words">
                <code className="text-foreground-secondary">
                  {operand.token}
                </code>{" "}
                · {operand.label}
                {operand.hidden ? " · Hidden in chart" : ""}
              </p>
            ))}
            <p className="pt-1 break-words">
              Stored expression: <code>{expression.formula}</code>
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

type StudioFormulaEditorProps = {
  expression: StudioWidgetConfig["expressions"][number];
  operands: StudioFormulaOperand[];
  letter: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onChange: (expression: StudioWidgetConfig["expressions"][number]) => void;
  onRemove: () => void;
  onCommit?: () => void;
  isolationActive?: boolean;
  onIsolationChange?: () => void;
};
