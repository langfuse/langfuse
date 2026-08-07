import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { V4_PREVIEW_LABEL } from "@/src/features/events/lib/v4PreviewLabel";
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

const PREVIEW_LABEL: Record<PreviewFlag, string> = {
  modernSession: "Compact Session View",
  v4UpgradeUi: "V4 Migration",
};

export function ControlledFeaturePreviewModal({
  open,
  onOpenChange,
}: ControlledFeaturePreviewModalProps) {
  const authSession = useSession();
  const { isBetaEnabled } = useV4Beta();
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
          description: `${PREVIEW_LABEL[variables.flag]} preview has been ${
            variables.enabled ? "enabled" : "disabled"
          }.`,
        });
      },
      onError: (error) => {
        showErrorToast("Failed to update feature preview", error.message);
      },
    });

  const onToggle = (flag: PreviewFlag) => (enabled: boolean) =>
    setFeaturePreviewEnabled.mutate({ flag, enabled });

  const state: Partial<Record<PreviewFlag, PreviewState>> = {
    modernSession: {
      enabled:
        authSession.data?.user?.featureFlags.modernSession === true ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      disabled:
        !isBetaEnabled ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isBetaEnabled
        ? `Compact Session View is only available on the events-backed session view. Turn on ${V4_PREVIEW_LABEL} to enable it.`
        : authSession.data?.environment.enableExperimentalFeatures === true
          ? "This preview is enabled by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
          : undefined,
      onToggle: onToggle("modernSession"),
      isToggling: setFeaturePreviewEnabled.isPending,
    },
    v4UpgradeUi: {
      enabled: authSession.data?.user?.featureFlags.v4UpgradeUi === true,
      onToggle: onToggle("v4UpgradeUi"),
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
