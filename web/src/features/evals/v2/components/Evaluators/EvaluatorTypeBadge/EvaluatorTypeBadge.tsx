import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";
import { useTranslations } from "next-intl";

import { Badge } from "@/src/components/ui/badge";

/** Displays the evaluator execution type with consistent product wording. */
export function EvaluatorTypeBadge({ type }: { type: EvalTemplateType }) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {type === EvalTemplateTypeEnum.CODE
        ? t("evaluatorTypes.code")
        : t("evaluatorTypes.llmAsJudge")}
    </Badge>
  );
}
