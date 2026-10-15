import { Code2, Gavel, Split, Tags } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

/** Icon, label and tile colours that mark each evaluator type. */
export const EVALUATOR_METHOD_PRESENTATION = {
  [EvalTemplateTypeEnum.CODE]: {
    Icon: Code2,
    label: "Code",
    tileClassName: "bg-category-orange/10 text-category-orange",
  },
  [EvalTemplateTypeEnum.LLM_AS_JUDGE]: {
    Icon: Gavel,
    label: "LLM-as-a-judge",
    tileClassName: "bg-light-blue text-dark-blue",
  },
  [EvalTemplateTypeEnum.DECISION_MODEL]: {
    Icon: Split,
    label: "Decision model",
    tileClassName: "bg-light-violet text-dark-violet",
  },
  [EvalTemplateTypeEnum.FACET]: {
    Icon: Tags,
    label: "Facet",
    tileClassName: "bg-muted text-muted-foreground",
  },
} as const satisfies Record<
  EvalTemplateType,
  { Icon: unknown; label: string; tileClassName: string }
>;

/** The icon that marks an evaluator type everywhere in the evals UI. */
export function getEvaluatorMethodIcon(type: EvalTemplateType) {
  return EVALUATOR_METHOD_PRESENTATION[type].Icon;
}
