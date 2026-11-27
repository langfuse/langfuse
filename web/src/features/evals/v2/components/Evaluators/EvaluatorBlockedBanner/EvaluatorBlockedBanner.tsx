import { formatDistanceToNow } from "date-fns";
import {
  getEvaluatorBlockMetadata,
  type EvaluatorBlockReason,
} from "@langfuse/shared";
import { RefreshCcw } from "@langfuse/icons";

import { Banner } from "@/src/components/design-system/Banner/Banner";

const DEFAULT_BLOCK_MESSAGE =
  "This evaluator is paused until its configuration is fixed.";

function getResolutionAction({
  projectId,
  blockReason,
}: {
  projectId: string;
  blockReason: EvaluatorBlockReason;
}) {
  if (
    blockReason === "LLM_CONNECTION_AUTH_INVALID" ||
    blockReason === "LLM_CONNECTION_BILLING_EXHAUSTED" ||
    blockReason === "LLM_CONNECTION_ENDPOINT_UNREACHABLE" ||
    blockReason === "LLM_CONNECTION_MISSING"
  ) {
    return {
      href: `/project/${projectId}/settings/llm-connections`,
      label: "Open LLM connections",
    };
  }

  return {
    href: `/project/${projectId}/evals/v2`,
    label: "Open evaluators",
  };
}

/** Explains why an evaluator is paused and directs users to the relevant fix. */
export function EvaluatorBlockedBanner({
  projectId,
  blockedAt,
  blockReason,
  blockMessage,
  canReactivate,
  reactivationPending,
  onReactivate,
}: {
  projectId: string;
  blockedAt: Date;
  blockReason: EvaluatorBlockReason | null;
  blockMessage: string | null;
  canReactivate: boolean;
  reactivationPending: boolean;
  onReactivate: () => void;
}) {
  const reason = blockReason ?? "EVAL_MODEL_CONFIG_INVALID";
  const blockMetadata = getEvaluatorBlockMetadata(reason);
  const blockedAtLabel = formatDistanceToNow(blockedAt, { addSuffix: true });
  const resolutionAction = getResolutionAction({
    projectId,
    blockReason: reason,
  });

  return (
    <Banner
      variant="warning"
      title="Evaluator paused"
      actions={[
        {
          text: resolutionAction.label,
          href: resolutionAction.href,
        },
        ...(canReactivate
          ? [
              {
                text: "Reactivate",
                icon: RefreshCcw,
                disabled: reactivationPending,
                onClick: onReactivate,
              },
            ]
          : []),
      ]}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{blockMetadata.shortLabel}</span>
        <span className="bg-border h-1 w-1 rounded-full" />
        <span title={blockedAt.toLocaleString()}>Paused {blockedAtLabel}</span>
      </div>

      <p className="mt-2 max-w-3xl">{blockMessage ?? DEFAULT_BLOCK_MESSAGE}</p>
    </Banner>
  );
}
