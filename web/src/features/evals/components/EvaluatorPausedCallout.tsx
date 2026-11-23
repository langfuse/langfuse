import { Banner } from "@/src/components/design-system/Banner/Banner";
import { env } from "@/src/env.mjs";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { formatDistanceToNow } from "date-fns";
import {
  type EvalTemplate,
  EvaluatorBlockReason,
  type JobConfiguration,
  JobConfigState,
  getEvaluatorBlockMetadata,
  getEvaluatorBlockResolutionPath,
} from "@langfuse/shared";
import { Fragment } from "react";

type EvaluatorPausedCalloutProps = {
  projectId: string;
  allowReactivation: boolean;
  blockedAt: NonNullable<JobConfiguration["blockedAt"]>;
  evalConfig: Pick<JobConfiguration, "id" | "blockReason" | "blockMessage"> & {
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
  allowReactivation,
  blockedAt,
  evalConfig,
}: EvaluatorPausedCalloutProps) {
  const utils = api.useUtils();
  const calloutId = `eval-config-paused-${evalConfig.id}`;

  const reactivateEvaluator = api.evals.updateEvalJob.useMutation({
    onSuccess: async () => {
      await utils.evals.invalidate();
      showSuccessToast({
        operation: "evaluator.reactivate",
        title: "Evaluator reactivated",
        description: "The evaluator is active again.",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Reactivation failed",
        error.message,
        classifyTrpcToastError(error, "evaluator.reactivate"),
      );
    },
  });

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
  const blockedAtDate = new Date(blockedAt);
  const blockedAtLabel = Number.isNaN(blockedAtDate.getTime())
    ? null
    : formatDistanceToNow(blockedAtDate, { addSuffix: true });

  return (
    <div id={calloutId}>
      <Banner
        variant="warning"
        title="Evaluator paused"
        actions={[
          {
            text: resolutionActionLabel,
            onClick: () => {
              window.open(
                `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${resolutionPath}`,
                "_blank",
                "noopener,noreferrer",
              );
            },
          },
          ...(allowReactivation
            ? [
                {
                  text: "Reactivate",
                  disabled: reactivateEvaluator.isPending,
                  onClick: () =>
                    reactivateEvaluator.mutate({
                      projectId,
                      evalConfigId: evalConfig.id,
                      config: {
                        status: JobConfigState.ACTIVE,
                      },
                    }),
                },
              ]
            : []),
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span>{blockMetadata.shortLabel}</span>
          {blockedAtLabel ? (
            <Fragment>
              <span className="bg-border h-1 w-1 rounded-full" />
              <span title={blockedAtDate.toLocaleString()}>
                Paused {blockedAtLabel}
              </span>
            </Fragment>
          ) : null}
        </div>

        <p className="mt-2 max-w-3xl">{blockMessage}</p>
      </Banner>
    </div>
  );
}
