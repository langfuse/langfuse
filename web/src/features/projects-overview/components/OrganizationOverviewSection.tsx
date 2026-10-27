import Link from "next/link";
import { isCloudPlan, planLabels } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { WorkspaceGlyph } from "@/src/features/app-shell";
import { OrganizationActions } from "@/src/features/projects-overview/components/OrganizationActions";
import { OrganizationSignals } from "@/src/features/projects-overview/components/OrganizationSignals";
import { ProjectGrid } from "@/src/features/projects-overview/components/ProjectGrid";
import { type OrganizationOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";

/** One organization on the all-organizations overview: heading, signals, and its projects. */
export function OrganizationOverviewSection({
  organization,
}: {
  organization: OrganizationOverview;
}) {
  const headingId = `organization-${organization.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <WorkspaceGlyph
            id={organization.id}
            name={organization.name}
            size="md"
          />
          <h2
            id={headingId}
            className="min-w-0 truncate text-base font-bold"
            title={organization.name}
          >
            <Link
              href={`/organization/${organization.id}`}
              className="hover:underline"
            >
              {organization.name}
            </Link>
          </h2>
          {organization.isDemo ? (
            <Badge text="Demo" color="blue" size="sm" />
          ) : null}
          {isCloudPlan(organization.plan) && !organization.isDemo ? (
            <Badge
              text={planLabels[organization.plan]}
              color="filled"
              font="mono"
              size="sm"
            />
          ) : null}
        </div>
        <div className="ml-auto">
          <OrganizationActions organizationId={organization.id} />
        </div>
      </div>
      <OrganizationSignals organization={organization} />
      <ProjectGrid organization={organization} />
    </section>
  );
}
