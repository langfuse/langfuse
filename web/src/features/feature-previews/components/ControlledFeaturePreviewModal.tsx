import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useSession } from "next-auth/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
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
        !isV4 ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isV4
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
