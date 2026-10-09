import type { ChangeEvent } from "react";
import type { ScoreResultTrigger } from "@langfuse/shared";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Trash2 } from "lucide-react";

type ScorePredicate = ScoreResultTrigger["predicates"][number];

const DATA_TYPE_OPTIONS = [
  { value: "BOOLEAN", label: "Boolean" },
  { value: "NUMERIC", label: "Numeric" },
  { value: "CATEGORICAL", label: "Categorical" },
  { value: "TEXT", label: "Text" },
] as const;

export const DEFAULT_SCORE_RESULT_PREDICATE: ScorePredicate = {
  scoreName: "",
  dataType: "BOOLEAN",
  operator: "=",
  value: false,
};

type RuleEvaluatorResultPredicateRowProps = {
  index: number;
  predicate: ScorePredicate;
  canRemove: boolean;
  onChange: (index: number, predicate: ScorePredicate) => void;
  onRemove: (index: number) => void;
};

export function RuleEvaluatorResultPredicateRow({
  index,
  predicate,
  canRemove,
  onChange,
  onRemove,
}: RuleEvaluatorResultPredicateRowProps) {
  const handleScoreNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(index, { ...predicate, scoreName: event.target.value });
  };
  const handleDataTypeChange = (dataType: ScorePredicate["dataType"]) => {
    onChange(index, predicateForDataType(dataType, predicate.scoreName));
  };
  const handleOperatorChange = (operator: string) => {
    onChange(index, { ...predicate, operator } as ScorePredicate);
  };
  const handleBooleanValueChange = (value: string) => {
    if (predicate.dataType !== "BOOLEAN") return;
    onChange(index, { ...predicate, value: value === "true" });
  };
  const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value =
      predicate.dataType === "NUMERIC"
        ? event.target.valueAsNumber
        : event.target.value;
    onChange(index, { ...predicate, value } as ScorePredicate);
  };
  const handleRemove = () => {
    onRemove(index);
  };
  const operatorOptions = getOperatorOptions(predicate.dataType);

  return (
    <div className="grid grid-cols-[minmax(10rem,1fr)_9rem_6rem_minmax(8rem,1fr)_2rem] items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">Score name</label>
        <Input
          value={predicate.scoreName}
          onChange={handleScoreNameChange}
          placeholder="e.g. toxicity"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">Type</label>
        <SelectInput
          value={predicate.dataType}
          options={[...DATA_TYPE_OPTIONS]}
          onValueChange={handleDataTypeChange}
          placeholder="Type"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">Operator</label>
        <SelectInput
          value={predicate.operator}
          options={operatorOptions}
          onValueChange={handleOperatorChange}
          placeholder="Operator"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">Value</label>
        {predicate.dataType === "BOOLEAN" ? (
          <SelectInput
            value={String(predicate.value)}
            options={[
              { value: "false", label: "false" },
              { value: "true", label: "true" },
            ]}
            onValueChange={handleBooleanValueChange}
            placeholder="Value"
          />
        ) : (
          <Input
            type={predicate.dataType === "NUMERIC" ? "number" : "text"}
            value={predicate.value}
            onChange={handleValueChange}
            placeholder="Value"
          />
        )}
      </div>
      <IconButton
        icon={Trash2}
        label="Remove score condition"
        disabled={!canRemove}
        onClick={handleRemove}
      />
    </div>
  );
}

function predicateForDataType(
  dataType: ScorePredicate["dataType"],
  scoreName: string,
): ScorePredicate {
  switch (dataType) {
    case "BOOLEAN":
      return { scoreName, dataType, operator: "=", value: false };
    case "NUMERIC":
      return { scoreName, dataType, operator: "=", value: 0 };
    case "CATEGORICAL":
    case "TEXT":
      return { scoreName, dataType, operator: "=", value: "" };
  }
}

function getOperatorOptions(dataType: ScorePredicate["dataType"]) {
  if (dataType === "NUMERIC") {
    return ["=", "!=", ">", ">=", "<", "<="].map((value) => ({
      value,
      label: value,
    }));
  }
  if (dataType === "BOOLEAN") return [{ value: "=", label: "=" }];
  return ["=", "!="].map((value) => ({ value, label: value }));
}
