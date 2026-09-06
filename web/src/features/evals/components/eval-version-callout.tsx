import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { type EvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import {
  isTraceTarget,
  isEventTarget,
  isExperimentTarget,
  isDatasetTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { useTranslations } from "next-intl";

interface EvalVersionCalloutProps {
  targetObject: string;
  evalCapabilities: EvalCapabilities;
}

type CalloutContent =
  | { visible: false }
  | {
      visible: true;
      titleKey:
        | "versionCallout.verifySdkVersion"
        | "versionCallout.verifyExperimentRunnerSdk"
        | "versionCallout.legacySdkMethods"
        | "versionCallout.upgradeToObservationEvaluators";
      descriptionKey:
        | "versionCallout.observationDescription"
        | "versionCallout.experimentDescription"
        | "versionCallout.datasetDescription"
        | "versionCallout.traceDescription";
      href: string;
    };

const getCalloutContent = (
  targetObject: string,
  evalCapabilities: EvalCapabilities,
): CalloutContent => {
  const hidden = {
    visible: false,
  } as const;

  // For event/observation target
  if (isEventTarget(targetObject)) {
    if (evalCapabilities.isNewCompatible) {
      return hidden;
    }

    return {
      visible: true,
      titleKey: "versionCallout.verifySdkVersion",
      descriptionKey: "versionCallout.observationDescription",
      href: "https://langfuse.com/docs/observability/sdk/upgrade-path",
    };
  }

  // For experiment target (Experiment Runner SDK)
  if (isExperimentTarget(targetObject)) {
    if (!evalCapabilities.isNewCompatible) {
      return {
        visible: true,
        titleKey: "versionCallout.verifyExperimentRunnerSdk",
        descriptionKey: "versionCallout.experimentDescription",
        href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk#experiment-runner-sdk",
      };
    }

    return hidden;
  }

  // For dataset target (legacy dataset run methods)
  if (isDatasetTarget(targetObject)) {
    // Forced-v3 projects keep trace evaluators as their intended experience —
    // no upgrade nag.
    if (evalCapabilities.forceV3Experience) {
      return hidden;
    }

    return {
      visible: true,
      titleKey: "versionCallout.legacySdkMethods",
      descriptionKey: "versionCallout.datasetDescription",
      href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk#experiment-runner-sdk",
    };
  }

  // For trace target
  if (isTraceTarget(targetObject)) {
    // Forced-v3 projects keep trace evaluators as their intended experience —
    // no upgrade nag.
    if (evalCapabilities.forceV3Experience) {
      return hidden;
    }

    return {
      visible: true,
      titleKey: "versionCallout.upgradeToObservationEvaluators",
      descriptionKey: "versionCallout.traceDescription",
      href: "https://langfuse.com/faq/all/llm-as-a-judge-migration",
    };
  }

  return hidden;
};

export function EvalVersionCallout({
  targetObject,
  evalCapabilities,
}: EvalVersionCalloutProps) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const content = getCalloutContent(targetObject, evalCapabilities);

  if (!content.visible) {
    return null;
  }

  return (
    <Alert
      variant="default"
      className="border-dark-yellow bg-light-yellow mt-2 max-w-4xl"
    >
      <AlertTriangle className="text-dark-yellow h-4 w-4" />
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-foreground font-bold">
              {t(content.titleKey)}
            </span>
            <span className="text-foreground text-sm">
              {t.rich(content.descriptionKey, {
                link: (chunks) => (
                  <a
                    href={content.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dark-blue font-bold hover:opacity-80"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </span>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
