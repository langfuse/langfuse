import { Code2, Scale, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

const evaluationTypes = [
  {
    value: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    label: "LLM-as-a-judge",
    icon: Sparkles,
  },
  {
    value: EvalTemplateTypeEnum.CODE,
    label: "Code evaluator",
    icon: Code2,
  },
  {
    value: EvalTemplateTypeEnum.DECISION_MODEL,
    label: "Decision model (experimental)",
    icon: Scale,
  },
] as const;

/** Selects the evaluator implementation. */
export function EvaluationTypeToggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvalTemplateType;
  onValueChange: (value: EvalTemplateType) => void;
  disabled?: boolean;
}) {
  const selectedType =
    evaluationTypes.find((type) => type.value === value) ?? evaluationTypes[0];
  const visibleTypes = disabled
    ? evaluationTypes.filter((type) => type.value === value)
    : evaluationTypes;
  const SelectedIcon = selectedType.icon;

  return (
    <>
      <div className="min-w-52 flex-1 md:hidden">
        <Select
          value={value}
          onValueChange={(mode) => onValueChange(mode as EvalTemplateType)}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Evaluation type">
            <SelectValue>
              <span className="flex min-w-0 items-center gap-2">
                <SelectedIcon className="h-4 w-4 shrink-0" />
                <span className="truncate" title={selectedType.label}>
                  {selectedType.label}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {visibleTypes.map(({ value: typeValue, label, icon: Icon }) => (
              <SelectItem key={typeValue} value={typeValue}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="hidden md:block">
        <Tabs
          value={value}
          onValueChange={(mode) => onValueChange(mode as EvalTemplateType)}
        >
          <Tabs.List variant="outline">
            {visibleTypes.map(({ value: typeValue, label, icon }) => (
              <Tabs.Trigger
                key={typeValue}
                value={typeValue}
                disabled={disabled}
                icon={icon}
                label={label}
              />
            ))}
          </Tabs.List>
        </Tabs>
      </div>
    </>
  );
}
