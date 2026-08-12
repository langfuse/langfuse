import { useState } from "react";
import { useRouter } from "next/router";
import {
  useV4UpgradeUiEnabled,
  useV4UpgradeUiFlag,
} from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { PARTNER_INTEGRATION_FAQ_URL } from "@/src/features/v4-migration/partnerIntegrationDocs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import {
  useProjectV4EvalData,
  useProjectV4SdkData,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { useEvalUpgradeAssistantPlan } from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { useCanUseInAppAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { EvaluatorMigrationDialog } from "@/src/features/v4-migration/EvaluatorMigrationDialog";
import {
  buildDeprecatedEvaluatorsUrl,
  buildEvaluatorUpgradeUrl,
} from "@/src/features/v4-migration/evaluatorMigrationUrls";

export function V4MigrationDelayBadge() {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const rawFlag = useV4UpgradeUiFlag();
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { project, organization } = useQueryProject();
  const forceV3 = useForceV3Experience(project?.id);
  const capture = usePostHogClientCapture();

  // Forced-v3 projects still see the data-delay badge (the ~15 min delay is
  // real for them too), but it points at the partner FAQ instead of the
  // migration panel. It remains gated on the raw v4UpgradeUi flag, since
  // `useV4UpgradeUiEnabled` is false for these projects.
  const enabled = v4UpgradeUiEnabled || (rawFlag && forceV3);
  const sdk = useProjectV4SdkData({
    projectId: project?.id,
    orgId: organization?.id,
    enabled: enabled && Boolean(project),
  });

  if (!enabled || !project || sdk.status !== "legacy") {
    return null;
  }

  const handleClick = () => {
    if (forceV3) {
      capture("v4_migration:delay_badge_clicked", { action: "docs" });
      window.open(PARTNER_INTEGRATION_FAQ_URL, "_blank", "noopener,noreferrer");
      return;
    }
    capture("v4_migration:delay_badge_clicked");
    openMigrationPanel({ id: project.id, name: project.name });
  };

  return (
    <V4MigrationBadgeContent
      onClick={handleClick}
      title="New data in ~15 min"
      description={
        forceV3
          ? "Learn more in the docs"
          : "Update your SDK for real-time data"
      }
    />
  );
}

/** Shared gating for the eval "Action required" badges: v4 upgrade UI flag,
 * project context, and a loaded, non-zero deprecated-eval count. */
function useEvalUpdateRequiredBadgeState() {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const { project, organization } = useQueryProject();
  const enabled = v4UpgradeUiEnabled && Boolean(project);
  const evalState = useProjectV4EvalData({
    projectId: project?.id,
    orgId: organization?.id,
    enabled,
  });

  const visible =
    v4UpgradeUiEnabled &&
    Boolean(project) &&
    evalState.status === "loaded" &&
    evalState.count > 0;

  return { project, organization, enabled, visible };
}

/** Opens the evaluator migration choices from the v4 migration badge. */
export function V4MigrationUpdateRequiredBadge() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const { project, visible, enabled, organization } =
    useEvalUpdateRequiredBadgeState();
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId: project?.id,
    orgId: organization?.id,
    enabled,
  });

  if (!visible || !project) {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:update_required_badge_clicked");
    setDialogOpen(true);
  };

  const handleManualUpgrade = () => {
    if (!project) return;
    setDialogOpen(false);
    router.push(buildDeprecatedEvaluatorsUrl(project.id));
  };

  return (
    <>
      <V4MigrationBadgeContent
        onClick={handleClick}
        title="Action required"
        description="Choose how to upgrade"
      />
      <EvaluatorMigrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope={{ type: "all" }}
        assistantPrompt={upgradePlan.assistantPrompt}
        onManualUpgrade={handleManualUpgrade}
        onAssistantStarted={() => undefined}
      />
    </>
  );
}

/** Opens the evaluator migration choices from an individual evaluator peek. */
export function V4MigrationEvaluatorUpdateRequiredBadge({
  projectId,
  evaluatorId,
}: {
  projectId: string;
  evaluatorId: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const canUseAssistant = useCanUseInAppAgent();
  const { organization } = useQueryProject();
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId,
    orgId: organization?.id,
    enabled: true,
  });
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();

  if (!v4UpgradeUiEnabled) return null;

  const handleManualUpgrade = () => {
    setDialogOpen(false);
    router.push(buildEvaluatorUpgradeUrl(projectId, evaluatorId));
  };

  const handleClick = () => {
    capture("v4_migration:update_required_badge_clicked", {
      scope: "single",
    });
    if (!canUseAssistant) {
      handleManualUpgrade();
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <V4MigrationBadgeContent
        onClick={handleClick}
        title="Action required"
        description={
          canUseAssistant ? "Choose how to upgrade" : "Start upgrade now"
        }
      />
      <EvaluatorMigrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope={{ type: "single" }}
        assistantPrompt={upgradePlan.assistantPrompt}
        onManualUpgrade={handleManualUpgrade}
        onAssistantStarted={() => undefined}
      />
    </>
  );
}
