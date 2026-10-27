import { Plus } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { ProjectOverviewCard } from "@/src/features/projects-overview/components/ProjectOverviewCard";
import { type OrganizationOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { createProjectRoute } from "@/src/features/setup";

/** The organization's project cards, or what to do when it has none yet. */
export function ProjectGrid({
  organization,
}: {
  organization: OrganizationOverview;
}) {
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization.id,
    scope: "projects:create",
  });

  if (organization.projects.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
        <p className="text-sm font-bold">No projects yet</p>
        <p className="text-muted-foreground max-w-prose text-sm">
          {canCreateProjects
            ? "Projects hold your traces, prompts and evaluations. Create the first one to start sending data."
            : "Ask an owner or admin of this organization to create a project or add you to one."}
        </p>
        {canCreateProjects ? (
          <Button
            href={createProjectRoute(organization.id)}
            text="Create project"
            icon={Plus}
            size="sm"
          />
        ) : null}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {organization.projects.map((project) => (
        <li key={project.id} className="min-w-0">
          <ProjectOverviewCard
            project={project}
            isActivityUnavailable={organization.loadState === "failed"}
          />
        </li>
      ))}
    </ul>
  );
}
