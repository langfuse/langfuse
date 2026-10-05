import Link from "next/link";

import { Card } from "@/src/components/ui/card";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

import { ProjectStarButton } from "./ProjectStarButton";
import { formatLastTrace, type LastTraceAt } from "./projectActivity";

export type PinnedProject = {
  id: string;
  name: string;
  orgName: string;
  lastTraceAt: LastTraceAt;
  source: "starred" | "recent";
};

/** Muted shell with an inset card; the organization sits in the shell's footer. */
export const PinnedProjectCard = ({
  project,
  isStarred,
  onToggleStar,
}: {
  project: PinnedProject;
  isStarred: boolean;
  onToggleStar: (projectId: string) => void;
}) => {
  const capture = usePostHogClientCapture();

  return (
    <div className="group bg-muted hover:bg-muted/70 relative rounded-xl border p-1 pb-0 transition-colors">
      <Link
        href={`/project/${project.id}`}
        onClick={() =>
          capture("home:pinned_project_clicked", { source: project.source })
        }
        className="absolute inset-0 rounded-xl"
        aria-label={`Go to project ${project.name}`}
      />
      <Card className="flex flex-col gap-1 px-4 py-3 shadow-none">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-base" title={project.name}>
            {project.name}
          </span>
          <ProjectStarButton
            projectId={project.id}
            isStarred={isStarred}
            onToggle={onToggleStar}
          />
        </div>
        <span className="text-muted-foreground font-mono text-xs">
          {formatLastTrace(project.lastTraceAt)}
        </span>
      </Card>
      <div
        className="text-muted-foreground flex h-9 items-center truncate px-3 text-xs"
        title={project.orgName}
      >
        {project.orgName}
      </div>
    </div>
  );
};
