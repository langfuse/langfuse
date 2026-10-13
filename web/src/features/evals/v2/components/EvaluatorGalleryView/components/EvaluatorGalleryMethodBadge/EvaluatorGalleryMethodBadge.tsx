import { Code2, Gavel, Split, Tags } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { cn } from "@/src/utils/tailwind";

const METHOD_BADGES = {
  [EvalTemplateTypeEnum.CODE]: {
    Icon: Code2,
    label: "Code",
    tileClassName: "bg-light-teal text-dark-teal",
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

export function getEvaluatorMethodIcon(type: EvalTemplateType) {
  return METHOD_BADGES[type].Icon;
}

export function EvaluatorGalleryMethodBadge({
  type,
}: {
  type: EvalTemplateType;
}) {
  const { Icon, label, tileClassName } = METHOD_BADGES[type];

  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap">
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
          tileClassName,
        )}
      >
        <Icon className="icon-sm" aria-hidden="true" />
      </span>
      {label}
    </span>
  );
}
