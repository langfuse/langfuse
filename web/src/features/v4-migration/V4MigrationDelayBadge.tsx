import { ChevronRight } from "lucide-react";
import { useRouter } from "next/router";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";
import {
  useProjectV4EvalData,
  useProjectV4SdkData,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useEvalUpgradeAssistantPlan } from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";

function BadgeContent({
  handleClick,
  title,
  description,
}: {
  handleClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={handleClick}
      className="group ring-input hover:bg-muted/50 hover:text-foreground inline-flex w-fit flex-none shrink-0 items-center gap-1.5 rounded-full bg-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap ring"
    >
      <span
        aria-hidden
        className="size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
      ></span>
      <span className="flex items-center">
        {title}
        <span className="flex max-w-0 items-center overflow-hidden transition-[max-width] duration-300 ease-out group-hover:max-w-96">
          <span className="whitespace-nowrap">.&nbsp;{description}.</span>
        </span>
        <ChevronRight className="ml-1 h-3 w-3 shrink-0" />
      </span>
    </button>
  );
}

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
    <BadgeContent
      handleClick={handleClick}
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

/** Opens the v4 migration drawer — for page-level surfaces where the drawer
 * is fully visible (e.g. the evaluators page header). */
export function V4MigrationUpdateRequiredBadge() {
  const openMigrationPanel = useOpenV4MigrationPanel();
  const capture = usePostHogClientCapture();
  const { project, visible } = useEvalUpdateRequiredBadgeState();

  if (!visible || !project) {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:update_required_badge_clicked");
    openMigrationPanel({ id: project.id, name: project.name });
  };

  return (
    <BadgeContent
      handleClick={handleClick}
      title="Action required"
      description="Update your eval set up"
    />
  );
}

/** Starts the eval upgrade in the in-app assistant — for overlay surfaces
 * like the table peek, where the assistant (`agent` layer) renders above the
 * peek (`panel` layer). When the assistant is unavailable, navigate to the
 * full migration page instead of opening a drawer behind the peek. */
export function V4MigrationUpdateRequiredAssistantBadge() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { setOpen: setAgentOpen, submit: submitAgentMessage } =
    useInAppAiAgent();
  const { project, organization, enabled, visible } =
    useEvalUpdateRequiredBadgeState();
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
    if (upgradePlan.canUseAssistant) {
      setAgentOpen(true);
      await submitAgentMessage(upgradePlan.assistantPrompt, {
        newConversation: true,
      });
      return;
    }
    await router.push("/v4-migration");
  };

  return (
    <BadgeContent
      handleClick={handleClick}
      title="Action required"
      description={
        upgradePlan.canUseAssistant
          ? "Click here to start the upgrade now"
          : "Open the migration guide"
      }
    />
  );
}
