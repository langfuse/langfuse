import { Code2, Scale, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

const METHOD_BADGES = {
  [EvalTemplateTypeEnum.CODE]: { Icon: Code2, label: "Code", tag: null },
  [EvalTemplateTypeEnum.LLM_AS_JUDGE]: {
    Icon: Sparkles,
    label: "LLM judge",
    tag: null,
  },
  [EvalTemplateTypeEnum.DECISION_MODEL]: {
    Icon: Scale,
    label: "Decision model",
    tag: "New",
  },
} as const satisfies Record<
  EvalTemplateType,
  { Icon: unknown; label: string; tag: string | null }
>;

export function EvaluatorGalleryMethodBadge({
  type,
}: {
  type: EvalTemplateType;
}) {
  const { Icon, label, tag } = METHOD_BADGES[type];

  return (
    <span className="bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none whitespace-nowrap">
      <Icon className="size-3" />
      {label}
      {tag ? (
        <span className="text-primary-accent font-bold">· {tag}</span>
      ) : null}
    </span>
  );
}
