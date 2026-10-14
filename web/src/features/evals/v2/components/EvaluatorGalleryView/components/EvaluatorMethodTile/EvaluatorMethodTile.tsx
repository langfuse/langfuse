import type { EvalTemplateType } from "@langfuse/shared";

import { EVALUATOR_METHOD_PRESENTATION } from "@/src/features/evals/v2/fns/templateGallery/evaluatorMethodPresentation";
import { cn } from "@/src/utils/tailwind";

type EvaluatorMethodTileProps = {
  type: EvalTemplateType;
  size?: "sm" | "lg";
};

/** The type icon on its pastel tile. */
export function EvaluatorMethodTile({
  type,
  size = "sm",
}: EvaluatorMethodTileProps) {
  const { Icon, tileClassName } = EVALUATOR_METHOD_PRESENTATION[type];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "lg" ? "size-10 rounded-md" : "size-5 rounded-sm",
        tileClassName,
      )}
    >
      <Icon
        className={size === "lg" ? "icon-base" : "icon-sm"}
        aria-hidden="true"
      />
    </span>
  );
}
