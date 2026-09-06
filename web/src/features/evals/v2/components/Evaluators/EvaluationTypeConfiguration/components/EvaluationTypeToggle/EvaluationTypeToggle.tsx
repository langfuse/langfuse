import { Code2, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";
import { useTranslations } from "next-intl";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

/** Selects the evaluator implementation. */
export function EvaluationTypeToggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvalTemplateType;
  onValueChange: (value: EvalTemplateType) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  return (
    <Tabs
      value={value}
      onValueChange={(mode) => onValueChange(mode as EvalTemplateType)}
    >
      <Tabs.List variant="outline">
        {!disabled || value === EvalTemplateTypeEnum.LLM_AS_JUDGE ? (
          <Tabs.Trigger
            value={EvalTemplateTypeEnum.LLM_AS_JUDGE}
            disabled={disabled}
            icon={Sparkles}
            label={t("evaluatorTypes.llmAsJudge")}
          />
        ) : null}
        {!disabled || value === EvalTemplateTypeEnum.CODE ? (
          <Tabs.Trigger
            value={EvalTemplateTypeEnum.CODE}
            disabled={disabled}
            icon={Code2}
            label={t("evaluatorTypes.codeEvaluator")}
          />
        ) : null}
      </Tabs.List>
    </Tabs>
  );
}
