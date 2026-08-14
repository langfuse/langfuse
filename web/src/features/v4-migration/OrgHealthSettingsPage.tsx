import { useSession } from "next-auth/react";

import Header from "@/src/components/layouts/header";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { OrgStatusSection } from "@/src/features/v4-migration/V4MigrationStatusPage";
import {
  useAccountV4MigrationData,
  type V4MigrationOrganization,
} from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { api } from "@/src/utils/api";

/**
 * Org Health settings page: the fleet view — every project's migration and
 * SDK state in one table, rows linking to each project's Health settings
 * page. Unlike the migration status page (a work list), migrated projects
 * stay visible here: this is where an admin verifies the whole org is green.
 */
export function OrgHealthSettingsPage({ orgId }: { orgId: string }) {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const session = useSession();

  const sessionOrg = session.data?.user?.organizations?.find(
    (candidate) => candidate.id === orgId,
  );
  const org: V4MigrationOrganization | null = sessionOrg
    ? {
        id: sessionOrg.id,
        name: sessionOrg.name,
        projects: sessionOrg.projects
          .filter((project) => !project.deletedAt)
          .map((project) => ({ id: project.id, name: project.name })),
      }
    : null;

  const statusByProjectId = useAccountV4MigrationData({
    organizations: org ? [org] : [],
    enabled: v4UpgradeUiEnabled && Boolean(org),
  });
  const lastTrace = api.organizations.lastTraceByProject.useQuery(
    { orgId },
    {
      enabled: Boolean(org && org.projects.length > 0),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  const readinessCounts = org
    ? org.projects.reduce(
        (counts, project) => {
          const status = statusByProjectId.get(project.id);
          if (!status) return counts;
          const readiness = getProjectMigrationReadiness(status);
          if (readiness === "ready") counts.ready += 1;
          if (readiness === "action-needed") counts.actionNeeded += 1;
          return counts;
        },
        { ready: 0, actionNeeded: 0 },
      )
    : { ready: 0, actionNeeded: 0 };
  const allGreen =
    org !== null &&
    org.projects.length > 0 &&
    readinessCounts.ready === org.projects.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title="Health" />
        <p className="text-muted-foreground text-sm">
          Instrumentation health across every project in this organization. Open
          a project row for its detailed checks and SDK versions.
        </p>
      </div>

      {!v4UpgradeUiEnabled ? (
        <p className="text-muted-foreground text-sm">
          Health checks are not available yet.
        </p>
      ) : !org || org.projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No projects in this organization yet.
        </p>
      ) : (
        <>
          {allGreen ? (
            <p className="text-muted-foreground flex items-center gap-2.5 text-sm">
              <V4MigrationStatusDot variant="done" />
              {org.projects.length === 1
                ? "The project in this organization is fully v4 compatible."
                : `All ${org.projects.length} projects are fully v4 compatible.`}
            </p>
          ) : readinessCounts.actionNeeded > 0 ? (
            <p className="text-muted-foreground flex items-center gap-2.5 text-sm">
              <V4MigrationStatusDot variant="action" />
              {readinessCounts.actionNeeded} of {org.projects.length}{" "}
              {org.projects.length === 1 ? "project" : "projects"}{" "}
              {readinessCounts.actionNeeded === 1 ? "needs" : "need"} attention.
            </p>
          ) : null}
          <OrgStatusSection
            org={org}
            statusByProjectId={statusByProjectId}
            lastTraceTimes={lastTrace.data ?? []}
            hideReadyProjects={false}
            showOrgHeading={false}
            rowHref={(projectId) => `/project/${projectId}/settings/health`}
          />
        </>
      )}
    </div>
  );
}
