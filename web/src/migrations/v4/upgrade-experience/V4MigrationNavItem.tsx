import { DropdownIndicator } from "@/src/app/design-system/DropdownIndicator/DropdownIndicator";
import {
  SidebarMenuButton,
  useSidebar,
} from "@/src/app/design-system/legacy-primitives/sidebar";
import { useV4UpgradeUiEnabled } from "@/src/migrations/v4/upgrade-experience/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { useQueryProject } from "@/src/identity/projects";
import { useProjectV4MigrationActions } from "@/src/migrations/v4/upgrade-experience/hooks/useV4MigrationData";
import { useOpenV4MigrationPanel } from "@/src/migrations/v4/upgrade-experience/hooks/useOpenV4MigrationPanel";

export function useV4MigrationNavItemProject() {
  const { project } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const { actionNeeded } = useProjectV4MigrationActions(
    v4UpgradeUiEnabled ? project?.id : undefined,
  );
  if (!v4UpgradeUiEnabled || !project || !actionNeeded) {
    return null;
  }
  return project;
}

export function V4MigrationNavItem({
  project,
}: {
  project: { id: string; name: string };
}) {
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const capture = usePostHogClientCapture();
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
      <div className="relative flex size-3.5 shrink-0 items-center justify-center">
        <span className="inline-flex h-2 w-2 rounded-full bg-orange-400" />
      </div>
      <span className="truncate font-bold" title={label}>
        {label}
      </span>
      <span className="ml-auto flex shrink-0">
        <DropdownIndicator direction="right" />
      </span>
    </SidebarMenuButton>
  );
}
