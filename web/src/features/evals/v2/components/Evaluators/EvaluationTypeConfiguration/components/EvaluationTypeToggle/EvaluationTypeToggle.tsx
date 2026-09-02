import { Code2, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

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
  return (
    <Tabs
      value={value}
      onValueChange={(mode) => onValueChange(mode as EvalTemplateType)}
    >
      <Tabs.List variant="outline">
        {!disabled || value === EvalTemplateTypeEnum.LLM_AS_JUDGE ? (
          <Tabs.Trigger
            value={EvalTemplateTypeEnum.LLM_AS_JUDGE}
            disabled={disabled}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            LLM-as-a-judge
          </Tabs.Trigger>
        ) : null}
        {!disabled || value === EvalTemplateTypeEnum.CODE ? (
          <Tabs.Trigger value={EvalTemplateTypeEnum.CODE} disabled={disabled}>
            <Code2 className="h-3.5 w-3.5 shrink-0" />
            Code evaluator
          </Tabs.Trigger>
        ) : null}
      </Tabs.List>
    </Tabs>
  );
}
