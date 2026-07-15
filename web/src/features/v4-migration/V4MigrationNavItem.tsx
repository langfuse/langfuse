import { ZapIcon } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";

export function V4MigrationNavItem() {
  const { canToggleV4 } = useV4Beta();
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();

  if (!canToggleV4 || !project) {
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
      openForProject({ id: project.id, name: project.name });
    }, 1);
  };

  return (
    <SidebarMenuButton onClick={handleClick} tooltip="Update">
      <ZapIcon className="h-4 w-4 shrink-0" />
      <span className="truncate" title="Update">
        Update
      </span>
      <span className="bg-light-yellow text-dark-yellow inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium">
        required
      </span>
    </SidebarMenuButton>
  );
}
