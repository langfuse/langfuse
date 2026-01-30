import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Info, AlertTriangle } from "lucide-react";
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

type CalloutVariant = "info" | "warning" | "hidden";

interface CalloutContent {
  variant: CalloutVariant;
  title: string;
  description: React.ReactNode;
}

const getCalloutContent = (
  targetObject: string,
  evalCapabilities: EvalCapabilities,
): CalloutContent => {
  // For event/observation target
  if (isEventTarget(targetObject)) {
    // If user IS compatible with OTEL, don't show callout
    if (evalCapabilities.isNewCompatible) {
      return {
        variant: "hidden",
        title: "",
        description: "",
      };
    }

    // If user is NOT compatible with OTEL, show warning
    return {
      variant: "warning",
      title: "Newer version of the Langfuse SDK required",
      description: (
        <>
          Running evaluators on live observations require JS SDK &ge; 4.0.0 or
          Python SDK &ge; 3.0.0. You can still set up this evaluator now—it will
          start running once you upgrade your SDK to latest.{" "}
          <a
            href="https://langfuse.com/docs/tracing/overview#langfuse-tracing-vs-opentelemetry"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-dark-blue hover:opacity-80"
          >
            Learn how to upgrade
          </a>
          .
        </>
      ),
    };
  }

  // For experiment target (OTEL-based experiments)
  if (isExperimentTarget(targetObject)) {
    // If user is NOT compatible with OTEL, show warning
    if (!evalCapabilities.isNewCompatible) {
      return {
        variant: "warning",
        title: "Are you sure you are already on the recommended SDK version?",
        description: (
          <>
            Running evaluators requires JS SDK &ge; 4.4.0 or Python SDK &ge;
            3.9.0. You can still set your evaluator up now—it will start running
            once you upgrade to the latest SDK version.{" "}
            <a
              href="https://langfuse.com/docs/tracing/overview#langfuse-tracing-vs-opentelemetry"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-dark-blue hover:opacity-80"
            >
              Learn how to upgrade
            </a>
            .
          </>
        ),
      };
    }
  }

  // For dataset target (now represents non-OTEL experiments when selected via second tab)
  if (isDatasetTarget(targetObject)) {
    return {
      variant: "info",
      title: "You selected an old SDK version",
      description:
        "Please consider upgrading to the latest SDK version for improved performance and features. You can even set up the evaluator for the new version now—it will start running once you upgrade to the latest SDK version.",
    };
  }

  // For trace target - always show deprecation info
  if (isTraceTarget(targetObject)) {
    return {
      variant: "info",
      title: "Consider upgrading to live observations evaluators",
      description:
        "Live observations evaluators provide more granular control and an easier workflow. We strongly recommend upgrading to live observations evaluators.",
    };
  }

  // Default: hidden
  return {
    variant: "hidden",
    title: "",
    description: "",
  };
};

export function EvalVersionCallout({
  targetObject,
  evalCapabilities,
}: EvalVersionCalloutProps) {
  const content = getCalloutContent(targetObject, evalCapabilities);

  if (content.variant === "hidden") {
    return null;
  }

  const isWarning = content.variant === "warning";

  return (
    <Alert
      variant="default"
      className={
        isWarning
          ? "mt-2 border-light-yellow bg-light-yellow"
          : "mt-2 border-light-blue bg-light-blue"
      }
    >
      {isWarning ? (
        <AlertTriangle className="h-4 w-4 text-dark-yellow dark:text-dark-yellow" />
      ) : (
        <Info className="h-4 w-4 text-dark-blue dark:text-dark-blue" />
      )}
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
