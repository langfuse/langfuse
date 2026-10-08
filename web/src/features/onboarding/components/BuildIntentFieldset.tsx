import type { ReactNode } from "react";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import {
  BUILD_INTENT_MAX_SELECTIONS,
  EXCLUSIVE_BUILD_INTENT,
  OTHER_BUILD_INTENT,
  toggleBuildIntent,
  type BuildIntentId,
  type BuildIntentOption,
} from "../lib/buildIntent";

type BuildIntentFieldsetProps = {
  options: BuildIntentOption[];
  value: BuildIntentId[];
  onChange: (value: BuildIntentId[]) => void;
  children: ReactNode;
};

export function BuildIntentFieldset({
  options,
  value,
  onChange,
  children,
}: BuildIntentFieldsetProps) {
  const isAtLimit = value.length >= BUILD_INTENT_MAX_SELECTIONS;

  const handleOptionToggle = (id: BuildIntentId, isChecked: boolean) =>
    onChange(toggleBuildIntent(value, id, isChecked));

  return (
    <fieldset>
      <legend className="text-xl font-bold">
        What will you use Langfuse for?
      </legend>
      <div className="mt-1 flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Pick up to {BUILD_INTENT_MAX_SELECTIONS}
        </p>
        {options.map((option) => (
          <BuildIntentOptionRow
            key={option.id}
            option={option}
            isChecked={value.includes(option.id)}
            isDisabled={
              isAtLimit &&
              !value.includes(option.id) &&
              option.id !== EXCLUSIVE_BUILD_INTENT
            }
            onToggle={handleOptionToggle}
          >
            {option.id === OTHER_BUILD_INTENT ? children : null}
          </BuildIntentOptionRow>
        ))}
      </div>
    </fieldset>
  );
}

type BuildIntentOptionRowProps = {
  option: BuildIntentOption;
  isChecked: boolean;
  isDisabled: boolean;
  onToggle: (id: BuildIntentId, isChecked: boolean) => void;
  children: ReactNode;
};

function BuildIntentOptionRow({
  option,
  isChecked,
  isDisabled,
  onToggle,
  children,
}: BuildIntentOptionRowProps) {
  const checkboxId = `build-intent-${option.id}`;

  const handleCheckedChange = (checked: boolean | "indeterminate") =>
    onToggle(option.id, checked === true);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Checkbox
            id={checkboxId}
            checked={isChecked}
            disabled={isDisabled}
            onCheckedChange={handleCheckedChange}
          />
        </div>
        <label htmlFor={checkboxId} className="flex cursor-pointer flex-col">
          <span className="text-sm">{option.label}</span>
          {option.hint ? (
            <span className="text-muted-foreground text-sm">{option.hint}</span>
          ) : null}
        </label>
      </div>
      {isChecked && children ? <div className="pl-7">{children}</div> : null}
    </div>
  );
}
