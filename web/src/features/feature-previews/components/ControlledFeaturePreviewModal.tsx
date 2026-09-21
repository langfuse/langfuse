/* eslint-disable no-nested-ternary */
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useSession } from "next-auth/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useReadPath, V4_PREVIEW_LABEL } from "@/src/features/events";
import {
  featurePreviewLabels,
  internalFlagLabels,
  internalFlags,
  type InternalFlag,
} from "@/src/features/feature-flags/available-flags";
import { isLangfuseInternalUserEmail } from "@/src/features/feature-flags/utils";
import { api } from "@/src/utils/api";

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
          title: "Feature preview updated",
          description: `${featurePreviewLabels[variables.flag]} preview has been ${variables.enabled ? "enabled" : "disabled"}.`,
        });
      },
      onError: (error) => {
        showErrorToast("Failed to update feature preview", error.message);
      },
    });
  const setInternalFlagEnabled =
    api.userAccount.setInternalFlagEnabled.useMutation({
      onSuccess: async (_data, variables) => {
        await authSession.update();
        capture("user_settings:feature_preview_toggled", {
          feature: variables.flag,
          isEnabled: variables.enabled,
        });
        showSuccessToast({
          title: "Internal flag updated",
          description: `${internalFlagLabels[variables.flag]} has been ${variables.enabled ? "enabled" : "disabled"}.`,
        });
      },
      onError: (error) => {
        showErrorToast("Failed to update internal flag", error.message);
      },
    });

  const onToggle = (flag: PreviewFlag) => (enabled: boolean) =>
    setFeaturePreviewEnabled.mutate({ flag, enabled });
  const onToggleInternalFlag = (flag: InternalFlag) => (enabled: boolean) =>
    setInternalFlagEnabled.mutate({ flag, enabled });

  const isModernSessionEnabled =
    authSession.data?.user?.featureFlags.modernSession === true ||
    authSession.data?.environment.enableExperimentalFeatures === true;

  const state: Partial<Record<PreviewFlag, PreviewState>> = {
    modernSession: {
      enabled: isModernSessionEnabled,
      disabled:
        !isV4 ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isV4
        ? `Compact Session View is only available on the events-backed session view. Turn on ${V4_PREVIEW_LABEL} to enable it.`
        : authSession.data?.environment.enableExperimentalFeatures === true
          ? "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
          : undefined,
      onToggle: onToggle("modernSession"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
    sessionTimeline: {
      enabled:
        authSession.data?.user?.featureFlags.sessionTimeline === true ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      disabled:
        !isV4 ||
        !isModernSessionEnabled ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isV4
        ? `Compact Session View is only available on the events-backed session view. Turn on ${V4_PREVIEW_LABEL} to enable it.`
        : !isModernSessionEnabled
          ? "Enable Compact Session View before enabling the Session Timeline."
          : authSession.data?.environment.enableExperimentalFeatures === true
            ? "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
            : undefined,
      onToggle: onToggle("sessionTimeline"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
    normalizedIoPreview: {
      enabled:
        authSession.data?.user?.featureFlags.normalizedIoPreview === true ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      disabled:
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason:
        authSession.data?.environment.enableExperimentalFeatures === true
          ? "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
          : undefined,
      onToggle: onToggle("normalizedIoPreview"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
  };

  const showInternalFlags = isLangfuseInternalUserEmail(
    authSession.data?.user?.email,
  );

  return (
    <FeaturePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      state={state}
      internalFlags={
        showInternalFlags
          ? internalFlags.map((flag) => ({
              flag,
              enabled: authSession.data?.user?.featureFlags[flag] === true,
              onToggle: onToggleInternalFlag(flag),
              isToggling: setInternalFlagEnabled.isPending,
            }))
          : undefined
      }
    />
  );
}
