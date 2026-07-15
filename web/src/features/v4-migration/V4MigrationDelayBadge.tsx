import { ChevronRight } from "lucide-react";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";

// Page-title badge flagging delayed ingestion; expands on hover and opens the
// v4 migration side panel on click. Delay copy is hardcoded until the backend
// reports per-project ingestion mode.
export function V4MigrationDelayBadge() {
  const { canToggleV4 } = useV4Beta();
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();

  if (!canToggleV4 || !project) {
    return null;
  }

  const handleClick = () => {
    capture("v4_migration:delay_badge_clicked");
    setAiAgentOpen(false);
    setSupportDrawerOpen(false);
    openForProject({ id: project.id, name: project.name });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group text-foreground ring-border hover:bg-muted/50 inline-flex w-fit flex-none shrink-0 items-center gap-1.5 rounded-full bg-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap ring"
    >
      <span
        aria-hidden
        className="bg-dark-yellow size-1.75 shrink-0 rounded-full"
      ></span>
      <span className="flex items-center">
        15 minutes delay
        <span className="flex max-w-0 items-center overflow-hidden transition-[max-width] duration-300 ease-out group-hover:max-w-96">
          <span className="whitespace-nowrap">
            .&nbsp;Update your SDK to receive real-time data.
          </span>
        </span>
        <ChevronRight className="ml-1 h-3 w-3 shrink-0" />
      </span>
    </button>
  );
}
