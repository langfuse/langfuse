import { Code2, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";
import { useTranslations } from "next-intl";

export function EvaluatorGalleryMethodBadge({
  type,
}: {
  type: EvalTemplateType;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const isCode = type === EvalTemplateTypeEnum.CODE;
  const Icon = isCode ? Code2 : Sparkles;

  return (
    <span className="bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none">
      <Icon className="size-3" />
      {isCode ? t("gallery.code") : t("gallery.llmJudge")}
    </span>
  );
}
