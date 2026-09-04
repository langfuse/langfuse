/* eslint-disable @repo/no-style-props, @repo/no-null-render */
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useQueryProject } from "@/src/features/projects/hooks";
import {
  V4MigrationHeaderContent,
  V4MigrationDetailsContent,
} from "@/src/features/v4-migration/V4MigrationContent";
import { useProjectV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { cn } from "@/src/utils/tailwind";

export const V4MigrationPanel = ({
  showCloseButton = true,
  className,
}: {
  showCloseButton?: boolean;
  className?: string;
}) => {
  const { open, setOpen, targetProject } = useV4MigrationPanel();
  const { project: routeProject } = useQueryProject();

  // Prefer the route's project so the panel follows navigation while open;
  // targetProject only decides on project-less routes (home, status page),
  // where it carries the project the opening surface was about.
  const project = routeProject
    ? {
        id: routeProject.id,
        name: routeProject.name,
        readiness:
          targetProject?.id === routeProject.id
            ? targetProject.readiness
            : undefined,
      }
    : targetProject;
  const migrationData = useProjectV4MigrationData({
    projectId: project?.id,
    enabled: open && Boolean(project?.id),
  });
  const liveReadiness = getProjectMigrationReadiness(migrationData);
  // Keep a known entry-point state while the panel queries are unresolved,
  // then derive readiness from the live results so the header cannot retain a
  // stale status-page snapshot after checks finish.
  const readiness =
    liveReadiness === "checking" || liveReadiness === "unavailable"
      ? project?.readiness
      : liveReadiness;

  if (!open) return null;

  return (
    <div
      className={cn([
        "bg-background relative flex h-full w-full min-w-0 flex-col",
        className,
      ])}
    >
      {showCloseButton && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4">
          <V4MigrationHeaderContent
            key={project?.id}
            titleRowClassName={showCloseButton ? "pr-10" : undefined}
            readiness={readiness}
          />
        </div>

        <div className="flex flex-col gap-6 px-4 pt-6 pb-16">
          <V4MigrationDetailsContent
            // Keyed like the header: a project switch while the panel stays
            // open remounts the content, so per-open analytics (the
            // panel_checks_loaded fire-once ref) reset for the new project.
            key={project?.id}
            onNavigate={() => setOpen(false)}
            projectId={project?.id}
          />
        </div>
      </div>
    </div>
  );
};
