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
  tag,
}: {
  type: EvalTemplateType;
  /** Accent word after the method, e.g. "New" or "Jev"; defaults per method. */
  tag?: string | null;
}) {
  const badge = METHOD_BADGES[type];
  const resolvedTag = tag === undefined ? badge.tag : tag;

  return (
    <span className="bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none whitespace-nowrap">
      <badge.Icon className="size-3" />
      {badge.label}
      {resolvedTag ? (
        <span className="text-primary-accent font-bold">· {resolvedTag}</span>
      ) : null}
    </span>
  );
}
