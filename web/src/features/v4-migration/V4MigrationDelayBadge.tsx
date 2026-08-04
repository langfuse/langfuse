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
} from "@/src/features/in-app-agent/components/InAppAgentProvider/InAppAiAgentProvider";
import { useEvalUpgradeAssistantPlan } from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";

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

  if (!v4UpgradeUiEnabled || !project || sdk.status !== "legacy") {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:delay_badge_clicked");
    openMigrationPanel({ id: project.id, name: project.name });
  };

  return (
    <V4MigrationBadgeContent
      onClick={handleClick}
      title="New data in ~15 min"
      description="Update your SDK for real-time data"
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
