import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useQueryProject } from "@/src/features/projects/hooks";
import {
  V4MigrationHeaderContent,
  V4MigrationDetailsContent,
} from "@/src/features/v4-migration/V4MigrationContent";
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

  if (!open) return null;

  // Prefer the route's project so the panel follows navigation while open;
  // targetProject only decides on project-less routes (home, status page),
  // where it carries the project the opening surface was about.
  const project = routeProject
    ? { id: routeProject.id, name: routeProject.name }
    : targetProject;

  return (
    <div
      className={cn([
        "bg-background flex h-full w-full min-w-0 flex-col",
        className,
      ])}
    >
      <div className="bg-background">
        <div className="flex min-h-11 w-full items-center justify-between gap-1 px-4 py-1">
          <span className="text-sm font-bold">Update</span>
          {showCloseButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t">
        <div className="bg-background sticky top-0 z-[1] px-4 pt-4">
          <V4MigrationHeaderContent projectName={project?.name} />
          <Separator className="mt-6" />
        </div>

        <div className="flex flex-col gap-6 px-4 pt-6 pb-16">
          <V4MigrationDetailsContent
            onNavigate={() => setOpen(false)}
            projectId={project?.id}
          />
        </div>
      </div>
    </div>
  );
};
