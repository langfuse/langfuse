import { Bot, Gauge, Zap, BarChart4 } from "lucide-react";

import {
  type ActionConfig,
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { useTranslations } from "next-intl";

export function EvaluatorsOnboardingView({
  codeEvaluatorLanguageDescription,
  createEvaluatorAction,
}: {
  codeEvaluatorLanguageDescription: string | null;
  createEvaluatorAction: ActionConfig;
}) {
  const t = useTranslations("sharedUi.onboarding");
  const llmAsJudgeValuePropositions: ValueProposition[] = [
    {
      title: t("evaluators.automateTitle"),
      description: t("evaluators.automateDescription"),
      icon: Bot,
    },
    {
      title: t("evaluators.qualityTitle"),
      description: t("evaluators.qualityDescription"),
      icon: Gauge,
    },
    {
      title: t("evaluators.scaleTitle"),
      description: t("evaluators.scaleDescription"),
      icon: Zap,
    },
    {
      title: t("evaluators.performanceTitle"),
      description: t("evaluators.performanceDescription"),
      icon: BarChart4,
    },
  ];

  if (codeEvaluatorLanguageDescription) {
    return (
      <SplashScreen
        title={t("evaluators.title")}
        description={
          <>
            {t("evaluators.descriptionIntro")}
            <ul className="text-muted-foreground mx-auto mt-2 max-w-2xl list-disc space-y-2 pl-5 text-left text-sm">
              <li>
                <span className="text-foreground font-bold">
                  {t("evaluators.judgeTitle")}
                </span>{" "}
                {t("evaluators.judgeDescription")}
              </li>
              <li>
                <span className="text-foreground font-bold">
                  {t("evaluators.codeTitle")}
                </span>{" "}
                {t("evaluators.codeDescription", {
                  language: codeEvaluatorLanguageDescription,
                })}
              </li>
            </ul>
          </>
        }
        primaryAction={createEvaluatorAction}
        secondaryAction={{
          label: t("learnMore"),
          href: "https://langfuse.com/docs/evaluation",
        }}
      />
    );
  }

  return (
    <SplashScreen
      title={t("evaluators.judgeOnlyTitle")}
      description={t("evaluators.judgeOnlyDescription")}
      valuePropositions={llmAsJudgeValuePropositions}
      primaryAction={createEvaluatorAction}
      secondaryAction={{
        label: t("learnMore"),
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-llm-as-a-judge-overview-v1.mp4"
    />
  );
}
