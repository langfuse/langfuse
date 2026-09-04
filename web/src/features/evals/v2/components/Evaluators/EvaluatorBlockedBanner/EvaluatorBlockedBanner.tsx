import { formatDistanceToNow } from "date-fns";
import {
  getEvaluatorBlockMetadata,
  type EvaluatorBlockReason,
} from "@langfuse/shared";
import { AlertTriangle, ExternalLinkIcon, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { Button } from "@/src/components/ui/button";

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
    <section
      role="alert"
      aria-live="polite"
      className="border-light-yellow bg-light-yellow rounded-lg border"
    >
      <div className="flex gap-3 p-4">
        <AlertTriangle className="text-dark-yellow mt-0.5 h-4 w-4 shrink-0" />

        <div className="min-w-0 flex-1">
          <h2 className="text-foreground text-base leading-5 font-bold">
            Evaluator paused
          </h2>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm leading-5">
            <span className="text-muted-foreground font-bold">
              {blockMetadata.shortLabel}
            </span>
            <Fragment>
              <span className="bg-border h-1 w-1 rounded-full" />
              <span title={blockedAt.toLocaleString()}>
                Paused {blockedAtLabel}
              </span>
            </Fragment>
          </div>

          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-5">
            {blockMessage ?? DEFAULT_BLOCK_MESSAGE}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 px-3">
              <Link href={resolutionAction.href}>
                <ExternalLinkIcon className="mr-1.5 h-3.5 w-3.5" />
                {resolutionAction.label}
              </Link>
            </Button>

            {canReactivate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={reactivationPending}
                onClick={onReactivate}
                className="h-8 px-3"
              >
                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                Reactivate
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
