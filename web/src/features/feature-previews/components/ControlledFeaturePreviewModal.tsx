/* eslint-disable no-nested-ternary */
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useSession } from "next-auth/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { V4_PREVIEW_LABEL } from "@/src/features/events/lib/v4PreviewLabel";
import { featurePreviewLabels } from "@/src/features/feature-flags/available-flags";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { belongsToTraceEvalsProject } from "@/src/features/evals/transcriptEvalsAccess";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

import {
  FeaturePreviewModal,
  type PreviewFlag,
  type PreviewState,
} from "./FeaturePreviewModal";

type ControlledFeaturePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ControlledFeaturePreviewModal({
  open,
  onOpenChange,
}: ControlledFeaturePreviewModalProps) {
  const authSession = useSession();
  const internalViewEnabled = useInternalFeaturesEnabled();
  const { isV4 } = useReadPath();
  const capture = usePostHogClientCapture();
  const setFeaturePreviewEnabled =
    api.userAccount.setFeaturePreviewEnabled.useMutation({
      onSuccess: async (_data, variables) => {
        await authSession.update();
        capture("user_settings:feature_preview_toggled", {
          feature: variables.flag,
          isEnabled: variables.enabled,
        });
        showSuccessToast({
          operation: "user_feature_preview.update",
          title: "Feature preview updated",
          description: `${featurePreviewLabels[variables.flag]} preview has been ${variables.enabled ? "enabled" : "disabled"}.`,
        });
      },
      onError: (error) => {
        showErrorToast(
          "Failed to update feature preview",
          error.message,
          classifyTrpcToastError(error, "user_feature_preview.update"),
        );
      },
    });

  const onToggle = (flag: PreviewFlag) => (enabled: boolean) =>
    setFeaturePreviewEnabled.mutate({ flag, enabled });

  const hasTraceEvalsProject = belongsToTraceEvalsProject(
    authSession.data?.user,
  );

  const isTraceEvalsPreviewOn =
    internalViewEnabled ||
    authSession.data?.user?.featureFlags.traceTranscriptEvals === true;

  const traceEvalsWarningReason = internalViewEnabled
    ? "Trace transcript evals are enabled by Internal view. Switching to External view hides them unless they have been enabled for you separately."
    : undefined;

  const isModernSessionEnabled =
    isV4 &&
    (authSession.data?.user?.featureFlags.sessionViewV2 === true ||
      authSession.data?.environment.enableExperimentalFeatures === true);

  const enableExperimentalFeatures =
    authSession.data?.environment.enableExperimentalFeatures === true;
  const unifiedViewWarningReason = (() => {
    if (!isV4) {
      return `Unified Trace and Session View requires ${V4_PREVIEW_LABEL}.`;
    }
    if (enableExperimentalFeatures) {
      return "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it.";
    }
    return undefined;
  })();

  const state: Partial<Record<PreviewFlag, PreviewState>> = {
    unifiedTraceSessionView: {
      enabled:
        isV4 &&
        (authSession.data?.user?.featureFlags.unifiedTraceSessionView ===
          true ||
          enableExperimentalFeatures),
      disabled: !isV4 || enableExperimentalFeatures,
      warningReason: unifiedViewWarningReason,
      onToggle: onToggle("unifiedTraceSessionView"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
    ...(hasTraceEvalsProject
      ? {
          traceTranscriptEvals: {
            enabled: isTraceEvalsPreviewOn,
            disabled: internalViewEnabled,
            warningReason: traceEvalsWarningReason,
            onToggle: onToggle("traceTranscriptEvals"),
            isToggling: setFeaturePreviewEnabled.isPending,
          },
        }
      : {}),
    sessionViewV2: {
      enabled: isModernSessionEnabled,
      disabled:
        !isV4 ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isV4
        ? `Redesigned Session View is only available on the events-backed session view. Turn on ${V4_PREVIEW_LABEL} to enable it.`
        : authSession.data?.environment.enableExperimentalFeatures === true
          ? "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
          : undefined,
      onToggle: onToggle("sessionViewV2"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
    sessionViewV2Timeline: {
      enabled:
        isModernSessionEnabled &&
        (authSession.data?.user?.featureFlags.sessionViewV2Timeline === true ||
          authSession.data?.environment.enableExperimentalFeatures === true),
      disabled:
        !isModernSessionEnabled ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isV4
        ? `Redesigned Session View is only available on the events-backed session view. Turn on ${V4_PREVIEW_LABEL} to enable it.`
        : !isModernSessionEnabled
          ? "Enable Redesigned Session View before enabling the Session Timeline."
          : authSession.data?.environment.enableExperimentalFeatures === true
            ? "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
            : undefined,
      onToggle: onToggle("sessionViewV2Timeline"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
  };

  return (
    <FeaturePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      state={state}
    />
  );
}
