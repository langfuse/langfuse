import { useState } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { buildProjectsOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { api } from "@/src/utils/api";

const OVERVIEW_STALE_TIME_MS = 60_000;

/**
 * Reads the overview for every organization of the user, one batched read
 * per organization plus the v4 readiness signals, and prepares what the page
 * renders. Sections fill in as their organization's read resolves.
 */
export function useProjectsOverview() {
  const session = useSession();
  const organizations = session.data?.user?.organizations ?? [];
  const isV4MigrationShown = useV4UpgradeUiEnabled();
  // Relative ages are read against the time the page opened, so cards do not
  // re-sort or re-word on every render.
  const [now] = useState(() => Date.now());

  const overviewQueries = api.useQueries((t) =>
    organizations.map((organization) =>
      t.projectsOverview.byOrganization(
        { orgId: organization.id },
        {
          staleTime: OVERVIEW_STALE_TIME_MS,
          refetchOnWindowFocus: false,
          trpc: { context: { skipBatch: true } },
        },
      ),
    ),
  );
  const migrationStatusByProjectId = useAccountV4MigrationData({
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      projects: organization.projects
        .filter((project) => !project.deletedAt)
        .map((project) => ({ id: project.id, name: project.name })),
    })),
    enabled: isV4MigrationShown,
  });

  const overviewByOrganizationId = new Map(
    organizations.flatMap((organization, index) => {
      const data = overviewQueries[index]?.data;
      return data ? [[organization.id, data] as const] : [];
    }),
  );
  const failedOrganizationIds = new Set(
    organizations
      .filter((_, index) => overviewQueries[index]?.isError)
      .map((organization) => organization.id),
  );

  return {
    isSessionLoading: session.status === "loading",
    organizations: buildProjectsOverview({
      organizations,
      overviewByOrganizationId,
      failedOrganizationIds,
      migrationReadinessByProjectId: isV4MigrationShown
        ? new Map(
            [...migrationStatusByProjectId].map(([projectId, status]) => [
              projectId,
              getProjectMigrationReadiness(status),
            ]),
          )
        : null,
      demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID ?? null,
      now,
    }),
  };
}
