import { Code2, Gavel, Split, Tags } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { cn } from "@/src/utils/tailwind";

const METHOD_BADGES = {
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
  return METHOD_BADGES[type].Icon;
}

/** The type icon on its pastel tile. */
export function EvaluatorMethodTile({
  type,
  size = "sm",
}: {
  type: EvalTemplateType;
  size?: "sm" | "lg";
}) {
  const { Icon, tileClassName } = METHOD_BADGES[type];

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

export function EvaluatorGalleryMethodBadge({
  type,
}: {
  type: EvalTemplateType;
}) {
  const { Icon, label } = METHOD_BADGES[type];

  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap">
      <Icon className="icon-sm" aria-hidden="true" />
      {label}
    </span>
  );
}
