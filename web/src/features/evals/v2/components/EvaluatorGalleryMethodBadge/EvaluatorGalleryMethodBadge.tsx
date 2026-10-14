import type { EvalTemplateType } from "@langfuse/shared";

import { EVALUATOR_METHOD_PRESENTATION } from "@/src/features/evals/v2/fns/templateGallery/evaluatorMethodPresentation";

type EvaluatorGalleryMethodBadgeProps = {
  type: EvalTemplateType;
};

/** Grey type icon with the type's name. */
export function EvaluatorGalleryMethodBadge({
  type,
}: EvaluatorGalleryMethodBadgeProps) {
  const { Icon, label } = EVALUATOR_METHOD_PRESENTATION[type];

  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap">
      <Icon className="icon-sm" aria-hidden="true" />
      {label}
    </span>
  );
}
