import { Code2, Gavel, Split, Tags } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

const METHOD_BADGES = {
  [EvalTemplateTypeEnum.CODE]: { Icon: Code2, label: "Code" },
  [EvalTemplateTypeEnum.LLM_AS_JUDGE]: {
    Icon: Gavel,
    label: "LLM-as-a-judge",
  },
  [EvalTemplateTypeEnum.DECISION_MODEL]: {
    Icon: Split,
    label: "Decision model",
  },
  [EvalTemplateTypeEnum.FACET]: { Icon: Tags, label: "Facet" },
} as const satisfies Record<EvalTemplateType, { Icon: unknown; label: string }>;

export function getEvaluatorMethodIcon(type: EvalTemplateType) {
  return METHOD_BADGES[type].Icon;
}

export function EvaluatorGalleryMethodBadge({
  type,
}: {
  type: EvalTemplateType;
}) {
  const { Icon, label } = METHOD_BADGES[type];

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold whitespace-nowrap">
      <span className="bg-muted inline-flex size-5 shrink-0 items-center justify-center rounded-sm">
        <Icon className="icon-sm text-muted-foreground" aria-hidden="true" />
      </span>
      {label}
    </span>
  );
}
