import { Button } from "@/src/components/ui/button";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { formatDistanceToNow } from "date-fns";
import {
  type EvalTemplate,
  EvaluatorBlockReason,
  type JobConfiguration,
  JobConfigState,
  getEvaluatorBlockMetadata,
  getEvaluatorBlockResolutionPath,
} from "@langfuse/shared";
import { AlertTriangle, ExternalLinkIcon, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

type EvaluatorPausedCalloutProps = {
  projectId: string;
  evalConfig: Pick<
    JobConfiguration,
    "id" | "blockedAt" | "blockReason" | "blockMessage"
  > & {
    evalTemplate?: Pick<EvalTemplate, "id"> | null;
  };
};

const DEFAULT_BLOCK_MESSAGE =
  "This evaluator is paused until its configuration is fixed and reactivated.";

function getResolutionActionLabel(params: {
  blockReason: EvaluatorBlockReason;
  templateId?: string | null;
}) {
  const { blockReason, templateId } = params;

  if (
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID ||
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_MISSING
  ) {
    return "Open LLM connections";
  }

  if (templateId) {
    return "Open evaluator template";
  }

  return "Open evaluators";
}

export function EvaluatorPausedCallout({
  projectId,
  evalConfig,
}: EvaluatorPausedCalloutProps) {
  const utils = api.useUtils();
  const calloutId = `eval-config-paused-${evalConfig.id}`;

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

  const blockReason =
    evalConfig.blockReason ?? EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID;
  const blockMetadata = getEvaluatorBlockMetadata(blockReason);
  const resolutionPath = getEvaluatorBlockResolutionPath({
    projectId,
    blockReason,
    templateId: evalConfig.evalTemplate?.id,
  });
  const resolutionActionLabel = getResolutionActionLabel({
    blockReason,
    templateId: evalConfig.evalTemplate?.id,
  });
  const blockMessage = evalConfig.blockMessage ?? DEFAULT_BLOCK_MESSAGE;
  const blockedAt = new Date(evalConfig.blockedAt);
  const blockedAtLabel = Number.isNaN(blockedAt.getTime())
    ? null
    : formatDistanceToNow(blockedAt, { addSuffix: true });

  return (
    <section
      id={calloutId}
      role="alert"
      aria-live="polite"
      className="border-light-yellow bg-light-yellow rounded-lg border"
    >
      <div className="flex gap-3 p-4">
        <AlertTriangle className="text-dark-yellow mt-0.5 h-4 w-4 shrink-0" />

        <div className="min-w-0 flex-1">
          <h3 className="text-foreground text-base leading-5 font-medium">
            Evaluator paused
          </h3>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm leading-5">
            <span className="text-muted-foreground font-medium">
              {blockMetadata.shortLabel}
            </span>
            {blockedAtLabel ? (
              <Fragment>
                <span className="bg-border h-1 w-1 rounded-full" />
                <span title={blockedAt.toLocaleString()}>
                  Paused {blockedAtLabel}
                </span>
              </Fragment>
            ) : null}
          </div>

          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-5">
            {blockMessage}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 px-3">
              <Link
                href={resolutionPath}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon className="mr-1.5 h-3.5 w-3.5" />
                {resolutionActionLabel}
              </Link>
            </Button>

            <Button
              size="sm"
              variant="outline"
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
              className="h-8 px-3"
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Reactivate
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
