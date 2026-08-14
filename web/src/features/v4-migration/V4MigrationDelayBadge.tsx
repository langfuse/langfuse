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
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import {
  getCustomInstrumentationSectionState,
  getOtelSectionState,
} from "@/src/features/v4-migration/sdkVersionStatus";
import { EvaluatorMigrationDialog } from "@/src/features/v4-migration/EvaluatorMigrationDialog";
import { buildDeprecatedEvaluatorsUrl } from "@/src/features/v4-migration/evaluatorMigrationUrls";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export function V4MigrationDelayBadge() {
  const v4UpgradeUiFlagEnabled = useV4UpgradeUiFlag();
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { project } = useQueryProject();
  const forceV3 = useForceV3Experience(project?.id);
  const { isBetaEnabled } = useV4Beta();
  const capture = usePostHogClientCapture();

  // Forced-v3 projects still see the data-delay badge, but it points at the
  // partner FAQ instead of the migration panel
  const enabled = v4UpgradeUiFlagEnabled && (!forceV3 || isBetaEnabled);
  const sdk = useProjectV4SdkData({
    projectId: project?.id,
    enabled: enabled && Boolean(project),
  });

  // Every delayed ingestion path shows the pill, matching the migration
  // panel's per-path offender detectors (LFE-14861) — not just outdated SDKs.
  // Unlike the panel's Update SDK section, the pill states a factual delay,
  // so the SDK path needs a confirmed-outdated series: an unparsable version
  // is grounds for review, not proof the data is delayed.
  const isTransient = sdk.status === "checking" || sdk.status === "error";
  const sdkActionable = !isTransient && sdk.upgradeRequiredCount > 0;
  const otelActionable =
    !isTransient && getOtelSectionState(sdk).delayedCount > 0;
  const customActionable =
    !isTransient && getCustomInstrumentationSectionState(sdk).series.length > 0;
  const actionablePaths = [
    sdkActionable,
    otelActionable,
    customActionable,
  ].filter(Boolean).length;

  if (!enabled || !project || actionablePaths === 0) {
    return null;
  }

  const handleClick = () => {
    if (forceV3) {
      capture("v4_migration:delay_badge_clicked", { action: "docs" });
      window.open(PARTNER_INTEGRATION_FAQ_URL, "_blank", "noopener,noreferrer");
      return;
    }
    capture("v4_migration:delay_badge_clicked");
    openMigrationPanel({ id: project.id, name: project.name }, "delay_badge");
  };

  // The hover's action clause echoes the panel section the click opens;
  // multiple delayed paths get the generic clause.
  const description =
    actionablePaths > 1
      ? "Upgrade to v4 for real-time data"
      : sdkActionable
        ? "Update your SDK for real-time data"
        : otelActionable
          ? "Update your OTel instrumentation for real-time data"
          : "Upgrade your instrumentation for real-time data";

  return (
    <V4MigrationBadgeContent
      onClick={handleClick}
      title="New data in ~15 min"
      description={forceV3 ? "Learn more in the docs" : description}
    />
  );
}

/** Shared gating for the eval "Action required" badges: v4 upgrade UI flag,
 * project context, and a loaded, non-zero deprecated-eval count. */
function useEvalUpdateRequiredBadgeState() {
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const enabled = v4UpgradeUiEnabled && Boolean(project);
  const evalState = useProjectV4EvalData({
    projectId: project?.id,
    enabled,
  });

  const visible =
    v4UpgradeUiEnabled &&
    Boolean(project) &&
    evalState.status === "loaded" &&
    evalState.count > 0;

  return { project, enabled, visible };
}

/** Opens the evaluator migration choices from the v4 migration badge. */
export function V4MigrationUpdateRequiredBadge() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const { project, visible, enabled } = useEvalUpdateRequiredBadgeState();
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId: project?.id,
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
