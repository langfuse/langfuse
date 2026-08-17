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
    <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs">
      <Icon className="h-3 w-3" />
      {isCode ? "Code" : "LLM judge"}
    </span>
  );
}
