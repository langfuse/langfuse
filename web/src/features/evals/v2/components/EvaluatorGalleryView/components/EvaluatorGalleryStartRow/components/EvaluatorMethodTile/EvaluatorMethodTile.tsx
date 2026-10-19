import type { EvalTemplateType } from "@langfuse/shared";

import { EVALUATOR_METHOD_PRESENTATION } from "@/src/features/evals/v2/fns/templateGallery/evaluatorMethodPresentation";
import { cn } from "@/src/utils/tailwind";

type EvaluatorMethodTileProps = {
  type: EvalTemplateType;
};

/** The type icon on its pastel tile. */
export function EvaluatorMethodTile({ type }: EvaluatorMethodTileProps) {
  const { Icon, tileClassName } = EVALUATOR_METHOD_PRESENTATION[type];

  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-md",
        tileClassName,
      )}
    >
      <Icon className="icon-base" aria-hidden="true" />
    </span>
  );
}
