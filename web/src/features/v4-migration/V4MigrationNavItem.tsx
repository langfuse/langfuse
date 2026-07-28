import { ChevronRight } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useOpenV4MigrationPanel } from "@/src/features/v4-migration/hooks/useOpenV4MigrationPanel";

export function V4MigrationNavItem() {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const openMigrationPanel = useOpenV4MigrationPanel();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const { project, organization } = useQueryProject();
  const capture = usePostHogClientCapture();
  const migrationData = useProjectV4MigrationData({
    projectId: project?.id,
    orgId: organization?.id,
    enabled: v4UpgradeUiEnabled && Boolean(project),
  });

  if (!v4UpgradeUiEnabled || !project) {
    return null;
  }
  const readiness = getProjectMigrationReadiness({
    sdk: migrationData.sdk,
    evals: migrationData.evals,
    apis: migrationData.apis,
    exports: migrationData.exports,
  });
  const label =
    readiness === "ready"
      ? "Up to date"
      : readiness === "checking"
        ? "Checking"
        : readiness === "unavailable"
          ? "Check status"
          : "Action required";

  const handleClick = () => {
    capture("sidebar:v4_migration_card_clicked");
    if (isMobile) {
      setOpenMobileSidebar(false);
    }
    setTimeout(() => {
      // push to next tick to avoid flickering when hiding sidebar on mobile
      openMigrationPanel({ id: project.id, name: project.name });
    }, 1);
  };

  return (
    <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
      <SidebarMenuButton
        onClick={handleClick}
        tooltip={label}
        className="border-input w-full gap-1.5 rounded-full border pr-2 pl-[9px]"
      >
        <span
          className={
            readiness === "ready"
              ? "h-2 w-2 shrink-0 rounded-full bg-green-500 dark:bg-green-500"
              : "h-2 w-2 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
          }
        />
        <span className="truncate font-bold" title={label}>
          {label}
        </span>
        <ChevronRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0" />
      </SidebarMenuButton>
    </div>
  );
}
