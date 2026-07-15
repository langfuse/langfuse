import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import {
  useV4MigrationPanel,
  type V4MigrationTargetProject,
} from "@/src/features/v4-migration/V4MigrationPanelProvider";
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
  const { canToggleV4 } = useV4Beta();
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const capture = usePostHogClientCapture();

  if (!canToggleV4) {
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
      className="bg-light-yellow text-dark-yellow relative inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80"
    >
      Update
    </button>
  );
}
