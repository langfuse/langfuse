import {
  useV4MigrationPanel,
  type V4MigrationTargetProject,
} from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getProjectMigrationReadiness,
  type ProjectMigrationStatus,
} from "@/src/features/v4-migration/migrationData";

export function V4MigrationProjectChip({
  project,
  status,
}: {
  project: V4MigrationTargetProject;
  status: ProjectMigrationStatus | undefined;
}) {
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const capture = usePostHogClientCapture();

  const readiness = status ? getProjectMigrationReadiness(status) : "checking";
  const label =
    readiness === "ready"
      ? "Up to date"
      : readiness === "checking"
        ? "Checking"
        : readiness === "unavailable"
          ? "Check status"
          : "Update";

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
        className={
          readiness === "ready"
            ? "size-1.75 shrink-0 rounded-full bg-green-500 dark:bg-green-500"
            : "size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
        }
      ></span>
      {label}
    </button>
  );
}
