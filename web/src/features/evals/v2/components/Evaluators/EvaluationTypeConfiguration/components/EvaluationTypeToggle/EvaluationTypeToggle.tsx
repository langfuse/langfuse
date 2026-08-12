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
        <TabsTrigger
          value={EvalTemplateTypeEnum.LLM_AS_JUDGE}
          className="gap-1.5 leading-none"
          disabled={disabled}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          LLM-as-a-judge
        </TabsTrigger>
        <TabsTrigger
          value={EvalTemplateTypeEnum.CODE}
          className="gap-1.5 leading-none"
          disabled={disabled}
        >
          <Code2 className="h-3.5 w-3.5 shrink-0" />
          Code evaluator
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
