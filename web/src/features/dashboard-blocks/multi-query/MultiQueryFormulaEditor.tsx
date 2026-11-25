import { useRef } from "react";
import {
  type MultiQueryFormula,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { EyeIcon, EyeOff, TrashIcon } from "@langfuse/icons";
import { Input } from "@/src/components/design-system/Input/Input";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  formatMultiQueryFormula,
  parseMultiQueryFormulaInput,
} from "./multiQueryFormulas";
import { multiQueryMetricLabel } from "./multiQueryModel";

export function MultiQueryFormulaEditor({
  tab,
  formula,
  onChange,
  onRemove,
  onPlotOnly,
  track,
}: {
  tab: MultiQueryTab;
  formula: MultiQueryFormula;
  onChange: (formula: MultiQueryFormula) => void;
  onRemove: () => void;
  onPlotOnly: () => void;
  track: (action: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const beforeEdit = useRef("");
  const expression = formatMultiQueryFormula(tab, formula.expression);
  const setExpression = (value: string) =>
    onChange({
      ...formula,
      expression: parseMultiQueryFormulaInput(tab, value),
    });
  const operands = tab.queries.flatMap((query) =>
    query.metrics.map((metric) => {
      const alias = formatMultiQueryFormula(tab, query.id + "." + metric.id);
      return {
        value: alias,
        label:
          alias +
          " · " +
          query.label +
          (query.metrics.length > 1
            ? " · " + multiQueryMetricLabel(metric)
            : ""),
      };
    }),
  );
  return (
    <section className="bg-muted/40 flex flex-col gap-2 rounded-md p-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Formula name"
            maxLength={200}
            value={formula.label}
            onFocus={() => {
              beforeEdit.current = formula.label;
            }}
            onBlur={() => {
              if (beforeEdit.current !== formula.label)
                track("multi_query_formula_renamed");
            }}
            onChange={(event) =>
              onChange({ ...formula, label: event.target.value })
            }
          />
        </div>
        <IconButton
          label={
            formula.hidden ? "Show formula on chart" : "Hide formula from chart"
          }
          icon={formula.hidden ? EyeOff : EyeIcon}
          size="sm"
          onClick={() => {
            onChange({ ...formula, hidden: !formula.hidden || undefined });
            track("multi_query_formula_visibility_changed");
          }}
        />
        <IconButton
          label="Remove formula"
          icon={TrashIcon}
          size="sm"
          onClick={onRemove}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs" htmlFor={tab.id + "-" + formula.id}>
          Formula
        </label>
        <div className="w-36">
          <SelectInput
            aria-label="Insert series into formula"
            placeholder="Insert series"
            noCapture
            options={operands}
            value=""
            onValueChange={(alias) => {
              const start = input.current?.selectionStart ?? expression.length;
              const end = input.current?.selectionEnd ?? start;
              setExpression(
                expression.slice(0, start) + alias + expression.slice(end),
              );
              track("multi_query_formula_operand_inserted");
              input.current?.focus();
              requestAnimationFrame(() =>
                input.current?.setSelectionRange(
                  start + alias.length,
                  start + alias.length,
                ),
              );
            }}
          />
        </div>
      </div>
      <Input
        aria-label="Formula expression"
        id={tab.id + "-" + formula.id}
        ref={input}
        value={expression}
        onFocus={() => {
          beforeEdit.current = formula.expression;
        }}
        onBlur={() => {
          if (beforeEdit.current !== formula.expression)
            track("multi_query_formula_edited");
        }}
        placeholder="A / B"
        maxLength={1024}
        onChange={(event) => setExpression(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-1">
        <SelectInput
          aria-label="Formula format"
          placeholder="Number"
          value={formula.format}
          options={[
            { value: "number", label: "Number" },
            { value: "percent", label: "Percentage" },
          ]}
          onValueChange={(format) => {
            onChange({ ...formula, format });
            track("multi_query_formula_format_changed");
          }}
        />
        <Button
          text="Plot formula only"
          variant="ghost"
          size="sm"
          onClick={onPlotOnly}
        />
      </div>
    </section>
  );
}
