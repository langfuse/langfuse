import {
  useV4MigrationPanel,
  type V4MigrationTargetProject,
} from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

// Per-project migration status chip on the home page project cards. Demo:
// shown on every project until backend per-project SDK detection exists.
export function V4MigrationProjectChip({
  project,
}: {
  project: V4MigrationTargetProject;
}) {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const capture = usePostHogClientCapture();

  if (!v4UpgradeUiEnabled) {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:project_chip_clicked");
    setAiAgentOpen(false);
    setSupportDrawerOpen(false);
    openForProject(project);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-foreground ring-border hover:bg-muted/50 relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ring"
    >
      <span
        aria-hidden
        className="size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
      ></span>
      Update
    </button>
  );
}
