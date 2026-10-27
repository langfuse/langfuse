import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import { useAppNavigation } from "@/src/components/nav/AppNavigationProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects";
import { useProjectV4MigrationActions } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";

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
  const appNavigation = useAppNavigation();
  const capture = usePostHogClientCapture();
  const label = "Action required";

  const handleClick = () => {
    capture("sidebar:v4_migration_card_clicked");
    appNavigation?.closeTransientNavigation();
    setTimeout(() => {
      // push to next tick to avoid flickering when hiding sidebar on mobile
      openMigrationPanel(
        { id: project.id, name: project.name },
        "sidebar_card",
      );
    }, 1);
  };

  return (
    <SidebarNavItem.Button
      onClick={handleClick}
      leading={
        <span className="inline-flex size-2 rounded-full bg-orange-400" />
      }
      label={label}
      isLabelBold
      trailing={<DropdownIndicator direction="right" />}
    />
  );
}
