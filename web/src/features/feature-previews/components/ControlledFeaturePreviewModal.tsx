import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { V4_PREVIEW_LABEL } from "@/src/features/events/lib/v4PreviewLabel";
import { featurePreviewLabelKeys } from "@/src/features/feature-flags/available-flags";
import { api } from "@/src/utils/api";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("settingsEnterprise.featurePreviews");
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
          title: t("updatedTitle"),
          description: t("updatedDescription", {
            feature: t(featurePreviewLabelKeys[variables.flag]),
            state: variables.enabled ? t("enabled") : t("disabled"),
          }),
        });
      },
      onError: (error) => {
        showErrorToast(t("updateFailed"), error.message);
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
        ? t("eventsRequired", { preview: V4_PREVIEW_LABEL })
        : authSession.data?.environment.enableExperimentalFeatures === true
          ? t("environmentEnabled")
          : undefined,
      onToggle: onToggle("modernSession"),
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
