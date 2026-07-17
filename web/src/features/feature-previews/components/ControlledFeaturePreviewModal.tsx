import { useState } from "react";
import { useSession } from "next-auth/react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
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
  traceStation: "Compact Session View",
  searchBar: "Filter Search Bar",
};

export function ControlledFeaturePreviewModal({
  open,
  onOpenChange,
}: ControlledFeaturePreviewModalProps) {
  const authSession = useSession();
  const { isBetaEnabled } = useV4Beta();
  const capture = usePostHogClientCapture();
  const [pendingFlags, setPendingFlags] = useState<Set<PreviewFlag>>(new Set());
  const setFeaturePreviewEnabled =
    api.userAccount.setFeaturePreviewEnabled.useMutation({
      onMutate: (variables) => {
        setPendingFlags((current) => new Set(current).add(variables.flag));
      },
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
      onSettled: (_data, _error, variables) => {
        setPendingFlags((current) => {
          const next = new Set(current);
          next.delete(variables.flag);
          return next;
        });
      },
    });

  const onToggle = (flag: PreviewFlag) => (enabled: boolean) =>
    setFeaturePreviewEnabled.mutate({ flag, enabled });

  const state: Partial<Record<PreviewFlag, PreviewState>> = {
    traceStation: {
      enabled:
        authSession.data?.user?.featureFlags.traceStation === true ||
        authSession.data?.user?.admin === true ||
        authSession.data?.environment.enableExperimentalFeatures === true,
      warningReason: !isBetaEnabled
        ? "Compact Session View is available on the events-backed session view. Turn on Fast (Preview) to use it after enabling this preview."
        : authSession.data?.user?.admin === true ||
            authSession.data?.environment.enableExperimentalFeatures === true
          ? "This preview is enabled for all administrators or by LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES, so a per-user opt-out does not disable it."
          : undefined,
      onToggle: onToggle("traceStation"),
      isToggling:
        pendingFlags.has("traceStation") ||
        authSession.data?.user?.admin === true ||
        authSession.data?.environment.enableExperimentalFeatures === true,
    },
    // The "Filter Search Bar" preview is retired — the bar is now generally
    // available on the v4 events tables for everyone (see useSearchBarEnabled),
    // so it no longer renders a tile here. The `searchBar` flag plumbing
    // (PreviewFlag type, registry entry, the userAccount allowlist) is kept for
    // now so a rollback is a one-line revert; restore the `searchBar: { ... }`
    // state entry to bring the tile back.
    // TODO(remove ~2026-06-19): delete the dead searchBar plumbing once the GA
    // rollout is confirmed stable — see useSearchBarEnabled for the full list.
  };

  return (
    <FeaturePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      state={state}
    />
  );
}
