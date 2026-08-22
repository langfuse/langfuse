import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Badge } from "@/src/components/ui/badge";

/** Displays the evaluator execution type with consistent product wording. */
export function EvaluatorTypeBadge({ type }: { type: EvalTemplateType }) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {type === EvalTemplateTypeEnum.CODE ? "Code" : "LLM as a judge"}
    </Badge>
  );
}
