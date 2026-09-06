import { type EvaluatorBlockReason } from "@langfuse/shared";
import { AlertTriangle, ExternalLinkIcon, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/src/components/ui/button";

const BLOCK_REASON_TRANSLATION_KEYS = {
  LLM_CONNECTION_AUTH_INVALID: {
    label: "pausedCallout.reasons.authenticationFailed.label",
    message: "pausedCallout.reasons.authenticationFailed.message",
  },
  LLM_CONNECTION_BILLING_EXHAUSTED: {
    label: "pausedCallout.reasons.providerCreditsExhausted.label",
    message: "pausedCallout.reasons.providerCreditsExhausted.message",
  },
  LLM_CONNECTION_ENDPOINT_UNREACHABLE: {
    label: "pausedCallout.reasons.endpointUnreachable.label",
    message: "pausedCallout.reasons.endpointUnreachable.message",
  },
  LLM_CONNECTION_MISSING: {
    label: "pausedCallout.reasons.connectionMissing.label",
    message: "pausedCallout.reasons.connectionMissing.message",
  },
  DEFAULT_EVAL_MODEL_MISSING: {
    label: "pausedCallout.reasons.defaultModelMissing.label",
    message: "pausedCallout.reasons.defaultModelMissing.message",
  },
  EVAL_MODEL_CONFIG_INVALID: {
    label: "pausedCallout.reasons.modelInvalid.label",
    message: "pausedCallout.reasons.modelInvalid.message",
  },
  EVAL_MODEL_UNAVAILABLE: {
    label: "pausedCallout.reasons.modelUnavailable.label",
    message: "pausedCallout.reasons.modelUnavailable.message",
  },
  PROVIDER_ACCOUNT_NOT_READY: {
    label: "pausedCallout.reasons.providerSetupIncomplete.label",
    message: "pausedCallout.reasons.providerSetupIncomplete.message",
  },
} as const satisfies Record<
  EvaluatorBlockReason,
  { label: string; message: string }
>;

function getResolutionHref({
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
    return `/project/${projectId}/settings/llm-connections`;
  }

  return `/project/${projectId}/evals/v2`;
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
  const format = useFormatter();
  const t = useTranslations("evaluationAnalytics.evaluations");
  const reason = blockReason ?? "EVAL_MODEL_CONFIG_INVALID";
  const blockTranslationKeys = BLOCK_REASON_TRANSLATION_KEYS[reason];
  const blockedAtLabel = format.relativeTime(blockedAt);
  const blockedAtTitle = format.dateTime(blockedAt, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const opensLlmConnections =
    reason === "LLM_CONNECTION_AUTH_INVALID" ||
    reason === "LLM_CONNECTION_BILLING_EXHAUSTED" ||
    reason === "LLM_CONNECTION_ENDPOINT_UNREACHABLE" ||
    reason === "LLM_CONNECTION_MISSING";
  const resolutionHref = getResolutionHref({
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
            {t("evaluatorPaused")}
          </h2>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm leading-5">
            <span className="text-muted-foreground font-bold">
              {t(blockTranslationKeys.label)}
            </span>
            <Fragment>
              <span className="bg-border h-1 w-1 rounded-full" />
              <span title={blockedAtTitle}>
                {t("pausedAt", { time: blockedAtLabel })}
              </span>
            </Fragment>
          </div>

          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-5">
            {blockReason
              ? t(blockTranslationKeys.message)
              : (blockMessage ?? t("evaluatorPausedDefault"))}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 px-3">
              <Link href={resolutionHref}>
                <ExternalLinkIcon className="mr-1.5 h-3.5 w-3.5" />
                {opensLlmConnections
                  ? t("openLlmConnections")
                  : t("openEvaluators")}
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
                {t("reactivate")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
