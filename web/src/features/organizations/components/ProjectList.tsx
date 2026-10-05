import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { type Session } from "next-auth";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";

import { ProjectStarButton } from "./ProjectStarButton";
import { formatLastTraceShort, type LastTraceAt } from "./projectActivity";

type Project = NonNullable<
  Session["user"]
>["organizations"][number]["projects"][number];

/** Flat per-organization project list: name, last trace, actions, star. */
export const ProjectList = ({
  projects,
  lastTraceByProjectId,
  isStarred,
  onToggleStar,
}: {
  projects: Project[];
  lastTraceByProjectId: Map<string, LastTraceAt>;
  isStarred: (projectId: string) => boolean;
  onToggleStar: (projectId: string) => void;
}) => (
  <ul className="flex flex-col divide-y">
    {projects.map((project) => (
      <li
        key={project.id}
        className="group hover:bg-muted/50 relative flex h-11 items-center gap-3 px-3 transition-colors"
      >
        {!project.deletedAt && (
          <Link
            href={`/project/${project.id}`}
            className="absolute inset-0"
            aria-label={`Go to project ${project.name}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-sm" title={project.name}>
          {project.name}
        </span>
        <span className="text-muted-foreground w-48 shrink-0 text-xs">
          {project.deletedAt ? (
            "Project is being deleted"
          ) : (
            <span className="font-mono">
              {formatLastTraceShort(lastTraceByProjectId.get(project.id))}
            </span>
          )}
        </span>
        {project.deletedAt ? (
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        ) : (
          <DropdownMenuController
            align="end"
            renderMenu={() => (
              <DropdownMenuItem asChild>
                <Link href={`/project/${project.id}/settings`}>
                  Project settings
                </Link>
              </DropdownMenuItem>
            )}
          >
            {({ isOpen, Trigger }) => (
              <Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Project actions"
                  className={
                    isOpen
                      ? "text-muted-foreground relative z-10 shrink-0"
                      : "text-muted-foreground relative z-10 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  <Ellipsis className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Trigger>
            )}
          </DropdownMenuController>
        )}
        <ProjectStarButton
          projectId={project.id}
          isStarred={isStarred(project.id)}
          onToggle={onToggleStar}
        />
      </li>
    ))}
  </ul>
);
