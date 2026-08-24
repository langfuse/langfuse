import { Code2, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

export function EvaluatorGalleryMethodBadge({
  type,
}: {
  type: EvalTemplateType;
}) {
  const isCode = type === EvalTemplateTypeEnum.CODE;
  const Icon = isCode ? Code2 : Sparkles;

  return (
    <span className="bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none">
      <Icon className="size-3" />
      {isCode ? "Code" : "LLM judge"}
    </span>
  );
}
