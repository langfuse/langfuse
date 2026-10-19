import { type EvalTemplateType } from "@langfuse/shared";

import { Badge } from "@/src/components/ui/badge";
import { evaluatorTypeLabel } from "@/src/features/evals/v2/fns/evaluators/evaluatorTypeLabel";

/** Displays the evaluator execution type with consistent product wording. */
export function EvaluatorTypeBadge({ type }: { type: EvalTemplateType }) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {evaluatorTypeLabel(type)}
    </Badge>
  );
}
