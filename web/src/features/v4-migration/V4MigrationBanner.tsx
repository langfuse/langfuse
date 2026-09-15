import Link from "next/link";
import { useSession } from "next-auth/react";
import { Zap } from "lucide-react";
import { Callout } from "@/src/components/design-system/Callout/Callout";
import { DismissController } from "@/src/components/DismissController";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useAccountV4MigrationData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { getProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { env } from "@/src/env.mjs";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
// Shorter than the Callout default (30d) so the banner resurfaces while the
// migration deadline approaches.
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function useV4MigrationBannerState(enabled: boolean) {
  const session = useSession();

  // The demo org is not the user's to migrate, so it never triggers the banner.
  const organizations = (session.data?.user?.organizations ?? [])
    .filter((org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID)
    .map((org) => ({
      id: org.id,
      name: org.name,
      projects: org.projects
        .filter((project) => !project.deletedAt)
        .map((project) => ({ id: project.id, name: project.name })),
    }));
  const migrationStatusByProjectId = useAccountV4MigrationData({
    organizations,
    enabled: enabled && organizations.length > 0,
  });
  const statuses = Array.from(migrationStatusByProjectId.values());

  return {
    projectsNeedingMigration: statuses.filter(
      (status) => getProjectMigrationReadiness(status) === "action-needed",
    ).length,
    totalProjects: statuses.length,
  };
}

/**
 * Org-overview banner announcing v4 with links to the migration status page and
 * docs. The overview owns visibility through useV4MigrationBannerState.
 */
export function V4MigrationBanner({
  projectsNeedingMigration,
  totalProjects,
}: {
  projectsNeedingMigration: number;
  totalProjects: number;
}) {
  const capture = usePostHogClientCapture();

  return (
    <DismissController
      id="v4-migration-banner:v1"
      family="callouts"
      ttlMs={DISMISS_TTL_MS}
    >
      {({ onDismiss }) => (
        <div className="mb-4">
          <Callout
            variant="info"
            align="middle"
            actions={
              <>
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href="/v4-migration"
                    onClick={() =>
                      capture("v4_migration:overview_banner_status_clicked")
                    }
                  >
                    Check status
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <a
                    href={V4_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      capture("v4_migration:overview_banner_docs_clicked")
                    }
                  >
                    Docs
                  </a>
                </Button>
              </>
            }
            onDismiss={onDismiss}
          >
            <div className="flex items-start gap-2 sm:items-center">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
              <span>
                <span className="font-bold">
                  Langfuse v4 is here: real-time and up to 165× faster.
                </span>{" "}
                {projectsNeedingMigration === totalProjects
                  ? projectsNeedingMigration === 1
                    ? "Your project needs an upgrade."
                    : "All projects need an upgrade."
                  : `${projectsNeedingMigration} of your ${totalProjects} projects ${projectsNeedingMigration === 1 ? "needs" : "need"} an upgrade.`}
              </span>
            </div>
          </Callout>
        </div>
      )}
    </DismissController>
  );
}
