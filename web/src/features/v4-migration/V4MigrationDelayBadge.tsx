import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import {
  useProjectV4EvalData,
  useProjectV4SdkData,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useEvalUpgradeAssistantPlan } from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import {
  getCustomInstrumentationSectionState,
  getOtelSectionState,
  getSdkSectionState,
} from "@/src/features/v4-migration/sdkVersionStatus";

export function V4MigrationDelayBadge() {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { project, organization } = useQueryProject();
  const capture = usePostHogClientCapture();
  const sdk = useProjectV4SdkData({
    projectId: project?.id,
    orgId: organization?.id,
    enabled: v4UpgradeUiEnabled && Boolean(project),
  });

  // Every delayed ingestion path shows the pill, matching the migration
  // panel's per-path offender detectors (LFE-14861) — not just outdated SDKs.
  const isTransient = sdk.status === "checking" || sdk.status === "error";
  const sdkActionable =
    !isTransient && getSdkSectionState(sdk).status === "legacy";
  const otelActionable =
    !isTransient && getOtelSectionState(sdk).delayedCount > 0;
  const customActionable =
    !isTransient && getCustomInstrumentationSectionState(sdk).series.length > 0;
  const actionablePaths = [
    sdkActionable,
    otelActionable,
    customActionable,
  ].filter(Boolean).length;

  if (!v4UpgradeUiEnabled || !project || actionablePaths === 0) {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:delay_badge_clicked");
    openMigrationPanel({ id: project.id, name: project.name });
  };

  // The hover's action clause echoes the panel section the click opens;
  // multiple delayed paths get the generic clause.
  const description =
    actionablePaths > 1
      ? "Your setup is outdated. Upgrade for real-time data"
      : sdkActionable
        ? "Your setup is outdated. Update SDK for real-time data"
        : otelActionable
          ? "Your setup is outdated. Update OTel instrumentation for real-time data"
          : "Your setup is outdated. Upgrade instrumentation for real-time data";

  return (
    <V4MigrationBadgeContent
      onClick={handleClick}
      title="New data in ~15 min"
      description={description}
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

/** Opens the v4 migration drawer if no in-app agent is available, otherwise opens the in-app agent */
export function V4MigrationUpdateRequiredBadge() {
  const openMigrationPanel = useOpenV4MigrationPanel();
  const capture = usePostHogClientCapture();
  const canUseAgent = useCanUseInAppAgent();
  const { project, visible, enabled, organization } =
    useEvalUpdateRequiredBadgeState();
  const { setOpen: setAgentOpen, submit: submitAgentMessage } =
    useInAppAiAgent();
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId: project?.id,
    orgId: organization?.id,
    enabled,
  });

  if (!visible || !project) {
    return null;
  }

  const handleClick = async () => {
    capture("v4_migration:update_required_badge_clicked");
    if (canUseAgent) {
      setAgentOpen(true);
      await submitAgentMessage(upgradePlan.assistantPrompt, {
        newConversation: true,
      });
      return;
    }
    openMigrationPanel({ id: project.id, name: project.name });
  };

  return (
    <V4MigrationBadgeContent
      onClick={handleClick}
      title="Action required"
      description="Start the upgrade now"
    />
  );
}
