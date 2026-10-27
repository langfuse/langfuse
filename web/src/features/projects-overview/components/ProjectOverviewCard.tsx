import Link from "next/link";
import { ArrowRight, Settings } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { WorkspaceGlyph } from "@/src/features/app-shell";
import { IngestionStatusLine } from "@/src/features/projects-overview/components/IngestionStatusLine";
import { ProjectMigrationBadge } from "@/src/features/projects-overview/components/ProjectMigrationBadge";
import { type ProjectOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";
import { setupTracingRoute } from "@/src/features/setup";

const numberFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const roleLabels: Partial<Record<ProjectOverview["role"], string>> = {
  VIEWER: "Viewer",
  MEMBER: "Member",
};

/** A project's state at a glance; the whole card opens the project. */
export function ProjectOverviewCard({
  project,
  isActivityUnavailable,
}: {
  project: ProjectOverview;
  isActivityUnavailable: boolean;
}) {
  if (project.isDeleted) {
    return (
      <div className="bg-muted/40 flex h-full flex-col gap-2 rounded-lg border border-dashed p-4">
        <div className="flex min-w-0 items-center gap-2">
          <WorkspaceGlyph id={project.id} name={project.name} size="md" />
          <h3
            className="text-muted-foreground min-w-0 truncate text-sm font-bold"
            title={project.name}
          >
            {project.name}
          </h3>
        </div>
        <p className="text-muted-foreground text-xs">
          Project is being deleted
        </p>
      </div>
    );
  }

  const roleLabel = roleLabels[project.role];
  const isUsageHeavy = project.attention.includes("usage");
  const canSetUpTracing = project.ingestion.kind === "not-set-up";

  return (
    <div className="bg-card hover:border-border-contrast relative flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors">
      <Link
        href={`/project/${project.id}`}
        aria-label={`Open project ${project.name}`}
        className="focus-visible:ring-ring absolute inset-0 rounded-lg outline-hidden focus-visible:ring-2"
      />
      <div className="flex min-w-0 items-start gap-2.5">
        <WorkspaceGlyph id={project.id} name={project.name} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-sm font-bold" title={project.name}>
            {project.name}
          </h3>
          <IngestionStatusLine
            status={project.ingestion}
            isUnavailable={isActivityUnavailable}
          />
        </div>
        {roleLabel ? <Badge text={roleLabel} color="filled" size="sm" /> : null}
      </div>

      {project.usage && !canSetUpTracing ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Usage this period</span>
            <span className="font-mono">
              {numberFormat.format(project.usage.units)} units
              <span className="text-muted-foreground">
                {" "}
                · {percentFormat.format(project.usage.share)}
              </span>
            </span>
          </div>
          <div
            aria-hidden="true"
            className="bg-muted h-1 w-full overflow-hidden rounded-full"
          >
            <div
              className={
                isUsageHeavy
                  ? "bg-dark-yellow h-full rounded-full"
                  : "bg-foreground-tertiary h-full rounded-full"
              }
              style={{ width: `${Math.round(project.usage.share * 100)}%` }}
            />
          </div>
          {isUsageHeavy ? (
            <p className="text-dark-yellow text-xs">
              Most of the usage while the organization is near its plan limit
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {project.migration ? (
          <span className="relative z-1">
            <ProjectMigrationBadge
              project={{ id: project.id, name: project.name }}
              readiness={project.migration}
            />
          </span>
        ) : null}
        {project.retentionDays ? (
          <Badge
            text={`${project.retentionDays}-day retention`}
            color="ghost"
            size="sm"
          />
        ) : null}
        <span className="relative z-1 ml-auto flex items-center gap-1">
          {canSetUpTracing ? (
            <Link
              href={setupTracingRoute(project.id)}
              className="text-primary hover:bg-accent focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-bold outline-hidden focus-visible:ring-2"
            >
              Set up tracing
              <ArrowRight size="sm" aria-hidden />
            </Link>
          ) : null}
          <Link
            href={`/project/${project.id}/settings`}
            aria-label={`Settings for ${project.name}`}
            className="hover:bg-accent focus-visible:ring-ring inline-flex size-7 items-center justify-center rounded-md outline-hidden focus-visible:ring-2"
          >
            <Settings size="base" color="default" aria-hidden />
          </Link>
        </span>
      </div>
    </div>
  );
}
