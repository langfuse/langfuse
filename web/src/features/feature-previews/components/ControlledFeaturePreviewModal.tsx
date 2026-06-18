import { useState } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";

import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

import {
  FeaturePreviewModal,
  type PreviewFlag,
  type PreviewState,
} from "./FeaturePreviewModal";

type ControlledFeaturePreviewModalProps = {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PREVIEW_LABEL: Record<PreviewFlag, string> = {
  inAppAgent: "Langfuse Assistant",
  searchBar: "Filter Search Bar",
};

export function ControlledFeaturePreviewModal({
  session,
  open,
  onOpenChange,
}: ControlledFeaturePreviewModalProps) {
  const authSession = useSession();
  const { project, organization } = useQueryProjectOrOrganization();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  // Track in-flight toggles per flag. useMutation only remembers the LATEST
  // .mutate() in `variables`, so toggling two previews in quick succession
  // would let an earlier still-pending row look idle and re-enable its Switch.
  const [pendingFlags, setPendingFlags] = useState<Set<PreviewFlag>>(new Set());
  const setFeaturePreviewEnabled =
    api.userAccount.setFeaturePreviewEnabled.useMutation({
      onMutate: (variables) => {
        setPendingFlags((prev) => new Set(prev).add(variables.flag));
      },
      onSuccess: async (_data, variables) => {
        await authSession.update();
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
        setPendingFlags((prev) => {
          const next = new Set(prev);
          next.delete(variables.flag);
          return next;
        });
      },
    });

  const user = authSession.data?.user ?? session.user;
  if (!user) {
    return null;
  }

  const onToggle = (flag: PreviewFlag) => (enabled: boolean) =>
    setFeaturePreviewEnabled.mutate({ flag, enabled });
  // Each row reflects ITS OWN in-flight mutation, not just the latest one.
  const isToggling = (flag: PreviewFlag) => pendingFlags.has(flag);

  const state: Partial<Record<PreviewFlag, PreviewState>> = {
    inAppAgent: {
      enabled: user.featureFlags.inAppAgent === true,
      warningReason: getInAppAgentWarningReason({
        hasOrganizationContext: Boolean(organization),
        hasProjectContext: Boolean(project),
        hasInAppAgentEntitlement,
        organizationAiFeaturesEnabled: organization?.aiFeaturesEnabled,
      }),
      onToggle: onToggle("inAppAgent"),
      isToggling: isToggling("inAppAgent"),
    },
    // The "Filter Search Bar" preview is retired — the bar is now generally
    // available on the v4 events tables for everyone (see useSearchBarEnabled),
    // so it no longer renders a tile here. The `searchBar` flag plumbing
    // (PreviewFlag type, PREVIEW_LABEL, registry entry, the userAccount
    // allowlist) is kept for now so a rollback is a one-line revert; restore
    // the `searchBar: { ... }` state entry to bring the tile back.
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

function getInAppAgentWarningReason({
  hasOrganizationContext,
  hasProjectContext,
  hasInAppAgentEntitlement,
  organizationAiFeaturesEnabled,
}: {
  hasOrganizationContext: boolean;
  hasProjectContext: boolean;
  hasInAppAgentEntitlement: boolean;
  organizationAiFeaturesEnabled?: boolean;
}) {
  if (!hasOrganizationContext) {
    return "The Assistant button is only shown inside a project. Enabling this preview may not have any visible effect until you open a project.";
  }

  if (!hasInAppAgentEntitlement) {
    return "The Langfuse Assistant preview is not available on your current plan. You can enable the preview, but the Assistant button will not be shown here.";
  }

  if (organizationAiFeaturesEnabled === false) {
    return "AI features are disabled for this organization. You can enable the preview, but the Assistant will not run here until AI features are enabled.";
  }

  if (!hasProjectContext) {
    return "The Assistant button is only shown inside a project. Open a project to use it after enabling the preview.";
  }

  return undefined;
}
