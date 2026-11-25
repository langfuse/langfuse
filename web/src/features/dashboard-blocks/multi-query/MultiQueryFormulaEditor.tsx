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
import { MultiQueryFormulaInput } from "./MultiQueryFormulaInput";
import { formatMultiQueryFormula } from "./formulaOperands";

export function MultiQueryFormulaEditor({
  tab,
  formula,
  onChange,
  onRemove,
  onPlotOnly,
  track,
  validationMessage,
}: {
  tab: MultiQueryTab;
  formula: MultiQueryFormula;
  onChange: (formula: MultiQueryFormula) => void;
  onRemove: () => void;
  onPlotOnly: () => void;
  track: (action: string) => void;
  validationMessage?: string;
}) {
  const beforeEdit = useRef("");
  return (
    <section className="bg-muted/40 flex flex-col gap-2 rounded-md p-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Formula name"
            placeholder={
              formatMultiQueryFormula(tab, formula.expression).trim() ||
              "Name (optional)"
            }
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
      <MultiQueryFormulaInput
        tab={tab}
        formula={formula}
        onChange={onChange}
        validationMessage={validationMessage}
        track={track}
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
