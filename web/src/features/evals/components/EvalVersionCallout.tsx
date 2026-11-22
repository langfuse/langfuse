import { Banner } from "@/src/components/design-system/Banner/Banner";
import { type EvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import {
  isTraceTarget,
  isEventTarget,
  isExperimentTarget,
  isDatasetTarget,
} from "@/src/features/evals/utils/typeHelpers";

interface EvalVersionCalloutProps {
  content: CalloutContent;
}

interface CalloutContent {
  title: string;
  description: React.ReactNode;
  action: { text: string; href: string };
}

export const getEvalVersionCalloutContent = (
  targetObject: string,
  evalCapabilities: EvalCapabilities,
) => {
  // For event/observation target
  if (isEventTarget(targetObject)) {
    if (evalCapabilities.isNewCompatible) {
      return null;
    }

    return {
      title: "Please verify your SDK version",
      description:
        "This evaluator targets observations, which require JS SDK v4+ or Python SDK v3+. You can still configure this evaluator now—it will start running once you upgrade.",
      action: {
        text: "Learn more",
        href: "https://langfuse.com/docs/observability/sdk/upgrade-path",
      },
    };
  }

  // For experiment target (Experiment Runner SDK)
  if (isExperimentTarget(targetObject)) {
    if (!evalCapabilities.isNewCompatible) {
      return {
        title: "Please verify you are using the Experiment Runner SDK",
        description:
          "The Experiment Runner SDK requires JS SDK v4.4+ or Python SDK v3.9+. You can still configure this evaluator now—it will start running once you upgrade.",
        action: {
          text: "Learn more about the Experiment Runner SDK",
          href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk#experiment-runner-sdk",
        },
      };
    }

    return null;
  }

  // For dataset target (legacy dataset run methods)
  if (isDatasetTarget(targetObject)) {
    // Forced-v3 projects keep trace evaluators as their intended experience —
    // no upgrade nag.
    if (evalCapabilities.forceV3Experience) {
      return null;
    }

    return {
      title: "Legacy low-level SDK methods",
      description:
        "This evaluator targets traces from legacy low-level SDK methods for dataset runs that manually linked dataset items to traces. Consider upgrading to the Experiment Runner SDK for improved performance and features.",
      action: {
        text: "Learn more",
        href: "https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk#experiment-runner-sdk",
      },
    };
  }

  // For trace target
  if (isTraceTarget(targetObject)) {
    // Forced-v3 projects keep trace evaluators as their intended experience —
    // no upgrade nag.
    if (evalCapabilities.forceV3Experience) {
      return null;
    }

    return {
      title: "Consider upgrading to observation evaluators",
      description:
        "Observation evaluators provide more granular control and an easier workflow. We strongly recommend upgrading to observation evaluators.",
      action: {
        text: "Learn more",
        href: "https://langfuse.com/faq/all/llm-as-a-judge-migration",
      },
    };
  }

  return null;
};

export function EvalVersionCallout({ content }: EvalVersionCalloutProps) {
  return (
    <div className="mt-2 w-full max-w-4xl">
      <Banner
        variant="warning"
        title={content.title}
        actions={[content.action]}
      >
        {content.description}
      </Banner>
    </div>
  );
}
