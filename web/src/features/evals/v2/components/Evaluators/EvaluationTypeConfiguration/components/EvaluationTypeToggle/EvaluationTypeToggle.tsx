import { Code2, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

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
      <TabsList className="bg-background **:data-[state=active]:bg-muted border">
        {!disabled || value === EvalTemplateTypeEnum.LLM_AS_JUDGE ? (
          <TabsTrigger
            value={EvalTemplateTypeEnum.LLM_AS_JUDGE}
            disabled={disabled}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            LLM-as-a-judge
          </TabsTrigger>
        ) : null}
        {!disabled || value === EvalTemplateTypeEnum.CODE ? (
          <TabsTrigger value={EvalTemplateTypeEnum.CODE} disabled={disabled}>
            <Code2 className="h-3.5 w-3.5 shrink-0" />
            Code evaluator
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
}
