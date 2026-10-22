import { useState, type ChangeEvent } from "react";
import type {
  ScoreResultTrigger,
  TriggerableScoreDefinition,
} from "@langfuse/shared";

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

type RuleEvaluatorResultPredicateRowProps = {
  index: number;
  predicate: ScorePredicate;
  canRemove: boolean;
  scoreDefinitions: TriggerableScoreDefinition[] | null;
  onChange: (index: number, predicate: ScorePredicate) => void;
  onScoreNameChange: (index: number, scoreName: string) => void;
  onRemove: (index: number) => void;
};

export function RuleEvaluatorResultPredicateRow({
  index,
  predicate,
  canRemove,
  scoreDefinitions,
  onChange,
  onScoreNameChange,
  onRemove,
}: RuleEvaluatorResultPredicateRowProps) {
  const [numericValue, setNumericValue] = useState(() =>
    predicate.dataType === "NUMERIC" ? String(predicate.value) : "",
  );
  const selectedScoreDefinition = scoreDefinitions?.find(
    (score) => score.name === predicate.scoreName,
  );
  const fixedScore = scoreDefinitions !== null;
  const handleScoreNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(index, { ...predicate, scoreName: event.target.value });
  };
  const handleFixedScoreNameChange = (scoreName: string) => {
    onScoreNameChange(index, scoreName);
  };
  const handleDataTypeChange = (dataType: ScorePredicate["dataType"]) => {
    if (dataType === "NUMERIC") setNumericValue("0");
    onChange(index, predicateForDataType(dataType, predicate.scoreName));
  };
  const handleOperatorChange = (operator: string) => {
    onChange(index, { ...predicate, operator } as ScorePredicate);
  };
  const handleBooleanValueChange = (value: string) => {
    if (predicate.dataType !== "BOOLEAN") return;
    onChange(index, { ...predicate, value: value === "true" });
  };
  const handleCategoricalValueChange = (value: string) => {
    if (predicate.dataType !== "CATEGORICAL") return;
    onChange(index, { ...predicate, value });
  };
  const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (predicate.dataType === "BOOLEAN") return;
    if (predicate.dataType !== "NUMERIC") {
      onChange(index, { ...predicate, value: event.target.value });
      return;
    }
    const rawValue = event.target.value;
    setNumericValue(rawValue);
    const value = Number(rawValue);
    if (rawValue.trim() !== "" && Number.isFinite(value)) {
      onChange(index, { ...predicate, value });
    }
  };
  const handleNumericBlur = () => {
    if (predicate.dataType === "NUMERIC") {
      setNumericValue(String(predicate.value));
    }
  };
  const handleRemove = () => {
    onRemove(index);
  };
  const operatorOptions = getOperatorOptions(predicate.dataType);
  const rowClassName = fixedScore
    ? "grid grid-cols-[3.25rem_minmax(10rem,1fr)_6rem_minmax(8rem,1.5fr)_2rem] items-center gap-2"
    : "grid grid-cols-[3.25rem_minmax(10rem,1fr)_9rem_6rem_minmax(8rem,1.5fr)_2rem] items-center gap-2";

  return (
    <div className={rowClassName}>
      <span className="text-muted-foreground text-sm">And</span>
      {fixedScore ? (
        <SelectInput
          value={predicate.scoreName}
          options={(scoreDefinitions ?? []).map((score) => ({
            value: score.name,
            label: score.name,
          }))}
          onValueChange={handleFixedScoreNameChange}
          placeholder="Score name"
        />
      ) : (
        <Input
          value={predicate.scoreName}
          onChange={handleScoreNameChange}
          placeholder="e.g. toxicity"
        />
      )}
      {!fixedScore ? (
        <SelectInput
          value={predicate.dataType}
          options={[...DATA_TYPE_OPTIONS]}
          onValueChange={handleDataTypeChange}
          placeholder="Type"
        />
      ) : null}
      <SelectInput
        value={predicate.operator}
        options={operatorOptions}
        onValueChange={handleOperatorChange}
        placeholder="Operator"
      />
      <PredicateValueInput
        predicate={predicate}
        scoreDefinition={selectedScoreDefinition}
        numericValue={numericValue}
        onBooleanValueChange={handleBooleanValueChange}
        onCategoricalValueChange={handleCategoricalValueChange}
        onValueChange={handleValueChange}
        onNumericBlur={handleNumericBlur}
      />
      <IconButton
        icon={Trash2}
        label="Remove score condition"
        disabled={!canRemove}
        onClick={handleRemove}
      />
    </div>
  );
}

function PredicateValueInput({
  predicate,
  scoreDefinition,
  numericValue,
  onBooleanValueChange,
  onCategoricalValueChange,
  onValueChange,
  onNumericBlur,
}: {
  predicate: ScorePredicate;
  scoreDefinition: TriggerableScoreDefinition | undefined;
  numericValue: string;
  onBooleanValueChange: (value: string) => void;
  onCategoricalValueChange: (value: string) => void;
  onValueChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onNumericBlur: () => void;
}) {
  if (predicate.dataType === "BOOLEAN") {
    return (
      <SelectInput
        value={String(predicate.value)}
        options={[
          { value: "false", label: "false" },
          { value: "true", label: "true" },
        ]}
        onValueChange={onBooleanValueChange}
        placeholder="Value"
      />
    );
  }

  if (
    predicate.dataType === "CATEGORICAL" &&
    scoreDefinition?.dataType === "CATEGORICAL"
  ) {
    return (
      <SelectInput
        value={predicate.value}
        options={scoreDefinition.allowedValues.map((value) => ({
          value,
          label: value,
        }))}
        onValueChange={onCategoricalValueChange}
        placeholder="Value"
      />
    );
  }

  return (
    <Input
      type={predicate.dataType === "NUMERIC" ? "number" : "text"}
      value={predicate.dataType === "NUMERIC" ? numericValue : predicate.value}
      onChange={onValueChange}
      onBlur={onNumericBlur}
      placeholder="Value"
    />
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
