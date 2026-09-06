import { type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { type EvalTemplateType } from "@langfuse/shared";

import { Label } from "@/src/components/ui/label";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { EvaluationTypeToggle } from "./components/EvaluationTypeToggle/EvaluationTypeToggle";

/** Shared execution row; its container owns which mode-specific selector follows it. */
export function EvaluationTypeConfiguration({
  mode,
  onModeChange,
  disabled,
  children,
}: {
  mode: EvalTemplateType;
  onModeChange: (mode: EvalTemplateType) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        {t("evaluator.typeConfiguration.label")}
        <span className="inline-flex -translate-y-px">
          <InfoTooltip label={t("evaluator.typeConfiguration.about")}>
            {t("evaluator.typeConfiguration.tooltip")}
          </InfoTooltip>
        </span>
      </Label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("evaluator.typeConfiguration.run")}</span>
        <EvaluationTypeToggle
          value={mode}
          onValueChange={onModeChange}
          disabled={disabled}
        />
        <span>
          {mode === "CODE"
            ? t("evaluator.typeConfiguration.writtenIn")
            : t("evaluator.typeConfiguration.with")}
        </span>
        {children}
      </div>
    </div>
  );
}
