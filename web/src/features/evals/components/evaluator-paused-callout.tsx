import { Callout } from "@/src/components/ui/callout";
import { Button } from "@/src/components/ui/button";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import {
  type EvalTemplate,
  EvaluatorBlockReason,
  type JobConfiguration,
  JobConfigState,
  getEvaluatorBlockResolutionPath,
} from "@langfuse/shared";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

type EvaluatorPausedCalloutProps = {
  projectId: string;
  evalConfig: Pick<
    JobConfiguration,
    "id" | "blockedAt" | "blockReason" | "blockMessage"
  > & {
    evalTemplate?: Pick<EvalTemplate, "id"> | null;
  };
};

export function EvaluatorPausedCallout({
  projectId,
  evalConfig,
}: EvaluatorPausedCalloutProps) {
  const utils = api.useUtils();
  const reactivateEvaluator = api.evals.updateEvalJob.useMutation({
    onSuccess: async () => {
      await utils.evals.invalidate();
      showSuccessToast({
        title: "Evaluator reactivated",
        description: "The evaluator is active again.",
      });
    },
    onError: (error) => {
      showErrorToast("Reactivation failed", error.message);
    },
  });

  if (!evalConfig.blockedAt) {
    return null;
  }

  const resolutionPath = getEvaluatorBlockResolutionPath({
    projectId,
    blockReason:
      evalConfig.blockReason ?? EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID,
    templateId: evalConfig.evalTemplate?.id,
  });

  return (
    <Callout id={`eval-config-paused-${evalConfig.id}`} variant="warning">
      <p className="font-medium">Evaluator paused</p>
      <p className="mb-2 mt-1">
        {evalConfig.blockMessage ??
          "This evaluator is paused until its configuration is fixed and reactivated."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={resolutionPath}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 underline underline-offset-2 hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          Resolve issue
        </Link>
        <Button
          size="sm"
          loading={reactivateEvaluator.isPending}
          onClick={() =>
            reactivateEvaluator.mutate({
              projectId,
              evalConfigId: evalConfig.id,
              config: {
                status: JobConfigState.ACTIVE,
              },
            })
          }
        >
          Reactivate
        </Button>
      </div>
    </Callout>
  );
}
