import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Info } from "lucide-react";
import { type EvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import {
  isTraceTarget,
  isEventTarget,
  isExperimentTarget,
  isDatasetTarget,
} from "@/src/features/evals/utils/typeHelpers";

interface EvalVersionCalloutProps {
  targetObject: string;
  evalCapabilities: EvalCapabilities;
}

interface CalloutContent {
  visible: boolean;
  title: string;
  description: React.ReactNode;
}

const getCalloutContent = (
  targetObject: string,
  evalCapabilities: EvalCapabilities,
): CalloutContent => {
  const hidden = { visible: false, title: "", description: "" };

  // For event/observation target
  if (isEventTarget(targetObject)) {
    if (evalCapabilities.isNewCompatible) {
      return hidden;
    }

    return {
      visible: true,
      title: "Please check your SDK version",
      description: (
        <>
          This evaluator targets live observations, which require JS SDK v4+ or
          Python SDK v3+. You can still configure this evaluator now—it will
          start running once you upgrade.{" "}
          <a
            href="https://langfuse.com/docs/tracing/overview#langfuse-tracing-vs-opentelemetry"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-dark-blue hover:opacity-80"
          >
            Learn more
          </a>
          .
        </>
      ),
    };
  }

  // For experiment target (Experiment Runner SDK)
  if (isExperimentTarget(targetObject)) {
    if (!evalCapabilities.isNewCompatible) {
      return {
        visible: true,
        title: "Please check your SDK version",
        description: (
          <>
            The Experiment Runner SDK requires JS SDK v4.4+ or Python SDK v3.9+.
            You can still configure this evaluator now—it will start running
            once you upgrade.{" "}
            <a
              href="https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk#experiment-runner-sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-dark-blue hover:opacity-80"
            >
              Learn more
            </a>
            .
          </>
        ),
      };
    }

    return hidden;
  }

  // For dataset target (legacy dataset run methods)
  if (isDatasetTarget(targetObject)) {
    return {
      visible: true,
      title: "Legacy dataset run methods",
      description: (
        <>
          This evaluator targets traces from legacy low-level SDK methods for
          dataset runs. Consider upgrading to the Experiment Runner SDK for
          improved performance and features.{" "}
          <a
            href="https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk#experiment-runner-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-dark-blue hover:opacity-80"
          >
            Learn more
          </a>
          .
        </>
      ),
    };
  }

  // For trace target
  if (isTraceTarget(targetObject)) {
    return {
      visible: true,
      title: "Consider upgrading to live observations evaluators",
      description: (
        <>
          Live observations evaluators provide more granular control and an
          easier workflow. We strongly recommend upgrading to live observations
          evaluators.{" "}
          <a
            href="https://langfuse.com/faq/all/llm-as-a-judge-migration"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-dark-blue hover:opacity-80"
          >
            Learn more
          </a>
          .
        </>
      ),
    };
  }

  return hidden;
};

export function EvalVersionCallout({
  targetObject,
  evalCapabilities,
}: EvalVersionCalloutProps) {
  const content = getCalloutContent(targetObject, evalCapabilities);

  if (!content.visible) {
    return null;
  }

  return (
    <Alert variant="default" className="mt-2 border-light-blue bg-light-blue">
      <Info className="h-4 w-4 text-dark-blue dark:text-dark-blue" />
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">{content.title}</span>
            <span className="text-sm text-foreground">
              {content.description}
            </span>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
