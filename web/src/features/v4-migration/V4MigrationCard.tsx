import { ChevronRight, TriangleAlert } from "lucide-react";
import { useSidebar } from "@/src/components/ui/sidebar";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function V4MigrationCard() {
  const { canToggleV4 } = useV4Beta();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const capture = usePostHogClientCapture();

  if (!canToggleV4) {
    return null;
  }

  const handleClick = () => {
    capture("sidebar:v4_migration_card_clicked");
    if (isMobile) {
      setOpenMobileSidebar(false);
    }
    setTimeout(() => {
      // push to next tick to avoid flickering when hiding sidebar on mobile
      setAiAgentOpen(false);
      setSupportDrawerOpen(false);
      setMigrationPanelOpen(true);
    }, 1);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-md border border-yellow-300 bg-yellow-50 px-2.5 py-2.5 text-left group-data-[collapsible=icon]:hidden hover:bg-yellow-100 dark:border-yellow-700 dark:bg-yellow-950 dark:hover:bg-yellow-900"
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <TriangleAlert className="h-4 w-4 shrink-0 text-yellow-700 dark:text-yellow-500" />
          <span
            className="truncate text-sm font-semibold text-yellow-700 dark:text-yellow-500"
            title="Action required"
          >
            Action required
          </span>
        </div>
        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
      </div>
    </button>
  );
}
