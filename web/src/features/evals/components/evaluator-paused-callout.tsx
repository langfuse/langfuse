import { Button } from "@/src/components/ui/button";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  type EvalTemplate,
  EvaluatorBlockReason,
  type JobConfiguration,
  JobConfigState,
  getEvaluatorBlockResolutionPath,
} from "@langfuse/shared";
import { AlertTriangle, ExternalLinkIcon, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { useLocale, useTranslations } from "next-intl";

type EvaluatorPausedCalloutProps = {
  projectId: string;
  allowReactivation: boolean;
  evalConfig: Pick<
    JobConfiguration,
    "id" | "blockedAt" | "blockReason" | "blockMessage"
  > & {
    evalTemplate?: Pick<EvalTemplate, "id"> | null;
  };
};

export function EvaluatorPausedCallout({
  projectId,
  allowReactivation,
  evalConfig,
}: EvaluatorPausedCalloutProps) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const locale = useLocale();
  const utils = api.useUtils();
  const calloutId = `eval-config-paused-${evalConfig.id}`;

  const reactivateEvaluator = api.evals.updateEvalJob.useMutation({
    onSuccess: async () => {
      await utils.evals.invalidate();
      showSuccessToast({
        title: t("pausedCallout.reactivated"),
        description: t("pausedCallout.reactivatedDescription"),
      });
    },
    onError: (error) => {
      showErrorToast(t("pausedCallout.reactivationFailed"), error.message);
    },
  });

  if (!evalConfig.blockedAt) {
    return null;
  }

  const blockReason =
    evalConfig.blockReason ?? EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID;
  const blockReasonCopy = (() => {
    switch (blockReason) {
      case EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID:
        return {
          label: t("pausedCallout.reasons.authenticationFailed.label"),
          message: t("pausedCallout.reasons.authenticationFailed.message"),
        };
      case EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED:
        return {
          label: t("pausedCallout.reasons.providerCreditsExhausted.label"),
          message: t("pausedCallout.reasons.providerCreditsExhausted.message"),
        };
      case EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE:
        return {
          label: t("pausedCallout.reasons.endpointUnreachable.label"),
          message: t("pausedCallout.reasons.endpointUnreachable.message"),
        };
      case EvaluatorBlockReason.LLM_CONNECTION_MISSING:
        return {
          label: t("pausedCallout.reasons.connectionMissing.label"),
          message: t("pausedCallout.reasons.connectionMissing.message"),
        };
      case EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING:
        return {
          label: t("pausedCallout.reasons.defaultModelMissing.label"),
          message: t("pausedCallout.reasons.defaultModelMissing.message"),
        };
      case EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID:
        return {
          label: t("pausedCallout.reasons.modelInvalid.label"),
          message: t("pausedCallout.reasons.modelInvalid.message"),
        };
      case EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE:
        return {
          label: t("pausedCallout.reasons.modelUnavailable.label"),
          message: t("pausedCallout.reasons.modelUnavailable.message"),
        };
      case EvaluatorBlockReason.PROVIDER_ACCOUNT_NOT_READY:
        return {
          label: t("pausedCallout.reasons.providerSetupIncomplete.label"),
          message: t("pausedCallout.reasons.providerSetupIncomplete.message"),
        };
    }
  })();
  const resolutionPath = getEvaluatorBlockResolutionPath({
    projectId,
    blockReason,
    templateId: evalConfig.evalTemplate?.id,
  });
  const resolutionActionLabel =
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID ||
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_MISSING
      ? t("openLlmConnections")
      : evalConfig.evalTemplate?.id
        ? t("openEvaluatorTemplate")
        : t("openEvaluators");
  const blockMessage = blockReasonCopy.message;
  const blockedAt = new Date(evalConfig.blockedAt);
  const blockedAtLabel = Number.isNaN(blockedAt.getTime())
    ? null
    : formatDistanceToNow(blockedAt, {
        addSuffix: true,
        locale: locale === "zh-CN" ? zhCN : enUS,
      });

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
          <h3 className="text-foreground text-base leading-5 font-bold">
            {t("evaluatorPaused")}
          </h3>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm leading-5">
            <span className="text-muted-foreground font-bold">
              {blockReasonCopy.label}
            </span>
            {blockedAtLabel ? (
              <Fragment>
                <span className="bg-border h-1 w-1 rounded-full" />
                <span title={blockedAt.toLocaleString()}>
                  {t("pausedAt", { time: blockedAtLabel })}
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

            {allowReactivation ? (
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
                {t("reactivate")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
