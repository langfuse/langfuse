import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";

import { EvaluatorsOnboardingView } from "@/src/app/onboarding/shared-components/components/EvaluatorsOnboardingView/EvaluatorsOnboardingView";
import type { ActionConfig } from "@/src/app/design-system/legacy-primitives/splash-screen";
import { useIsCodeEvalEnabled } from "@/src/evaluators/hooks/useIsCodeEvalEnabled";

interface EvaluatorsOnboardingProps {
  projectId: string;
  createEvaluatorAction?: ActionConfig;
}

export function EvaluatorsOnboarding({
  projectId,
  createEvaluatorAction,
}: EvaluatorsOnboardingProps) {
  const { enabled, supportedSourceCodeLanguages } = useIsCodeEvalEnabled();
  const codeEvaluatorLanguageDescription =
    supportedSourceCodeLanguages.includes(EvalTemplateSourceCodeLanguage.PYTHON)
      ? "TypeScript or Python"
      : "TypeScript";
  const primaryAction = createEvaluatorAction ?? {
    label: "Create Evaluator",
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
