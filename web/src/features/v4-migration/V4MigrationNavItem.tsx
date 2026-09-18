/* eslint-disable @repo/no-null-render */
import { ChevronRight } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useProjectV4MigrationActions } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";

export function V4MigrationNavItem() {
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const capture = usePostHogClientCapture();
  const { actionNeeded } = useProjectV4MigrationActions(project?.id);

  if (!v4UpgradeUiEnabled || !project || !actionNeeded) {
    return null;
  }
  const label = "Action required";

  const handleClick = () => {
    capture("sidebar:v4_migration_card_clicked");
    if (isMobile) {
      setOpenMobileSidebar(false);
    }
    setTimeout(() => {
      // push to next tick to avoid flickering when hiding sidebar on mobile
      openMigrationPanel(
        { id: project.id, name: project.name },
        "sidebar_card",
      );
    }, 1);
  };

  return (
    <SidebarMenuButton onClick={handleClick} tooltip={label}>
      <div className="relative mx-1 flex h-2 w-2 shrink-0 items-center justify-center">
        <span className="inline-flex h-2 w-2 rounded-full bg-orange-400" />
      </div>
      <span className="truncate font-bold" title={label}>
        {label}
      </span>
      <ChevronRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
    </SidebarMenuButton>
  );
}
