import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
import { useTranslations } from "next-intl";

import { EvaluatorsOnboardingView } from "@/src/components/onboarding/components/EvaluatorsOnboardingView/EvaluatorsOnboardingView";
import type { ActionConfig } from "@/src/components/ui/splash-screen";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";

interface EvaluatorsOnboardingProps {
  projectId: string;
  createEvaluatorAction?: ActionConfig;
}

export function EvaluatorsOnboarding({
  projectId,
  createEvaluatorAction,
}: EvaluatorsOnboardingProps) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const { enabled, supportedSourceCodeLanguages } = useIsCodeEvalEnabled();
  const codeEvaluatorLanguageDescription =
    supportedSourceCodeLanguages.includes(EvalTemplateSourceCodeLanguage.PYTHON)
      ? t("onboarding.typeScriptOrPython")
      : "TypeScript";
  const primaryAction = createEvaluatorAction ?? {
    label: t("onboarding.createEvaluator"),
    href: `/project/${projectId}/evals/new`,
  };

  return (
    <EvaluatorsOnboardingView
      codeEvaluatorLanguageDescription={
        enabled ? codeEvaluatorLanguageDescription : null
      }
      createEvaluatorAction={primaryAction}
    />
  );
}
