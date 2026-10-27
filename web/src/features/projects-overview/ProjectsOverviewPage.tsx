import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { StringParam, useQueryParams, withDefault } from "use-query-params";
import { Plus } from "@langfuse/icons";
import { ErrorPage } from "@/src/components/error-page";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { Button } from "@/src/components/design-system/Button/Button";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  LandingNoticeCallout,
  type LandingNotice,
} from "@/src/features/projects-overview/components/LandingNoticeCallout";
import { NoOrganizationState } from "@/src/features/projects-overview/components/NoOrganizationState";
import { OrganizationActions } from "@/src/features/projects-overview/components/OrganizationActions";
import { OrganizationOverviewSection } from "@/src/features/projects-overview/components/OrganizationOverviewSection";
import { OrganizationSignals } from "@/src/features/projects-overview/components/OrganizationSignals";
import { ProjectGrid } from "@/src/features/projects-overview/components/ProjectGrid";
import {
  filterProjectsOverview,
  type OverviewStatusFilter,
} from "@/src/features/projects-overview/fns/projectsOverview/filterProjectsOverview";
import { type OrganizationOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";
import { useProjectsOverview } from "@/src/features/projects-overview/hooks/useProjectsOverview";
import { createOrganizationRoute } from "@/src/features/setup";
import {
  V4MigrationBanner,
  useV4MigrationBannerState,
} from "@/src/features/v4-migration/V4MigrationBanner";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

const STATUS_FILTERS = ["all", "attention", "not-set-up"] as const;
const LANDING_NOTICES = ["welcome", "last-project-unavailable"] as const;

const isStatusFilter = (value: string): value is OverviewStatusFilter =>
  (STATUS_FILTERS as readonly string[]).includes(value);
const isLandingNotice = (
  value: string | null | undefined,
): value is LandingNotice =>
  (LANDING_NOTICES as readonly (string | null | undefined)[]).includes(value);

function OverviewResults({
  organizations,
  isSingleOrganization,
}: {
  organizations: OrganizationOverview[];
  isSingleOrganization: boolean;
}) {
  if (organizations.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        No projects match. Clear the search or pick another filter.
      </p>
    );
  }
  if (isSingleOrganization) {
    return <ProjectGrid organization={organizations[0]} />;
  }
  return (
    <div className="flex flex-col gap-10">
      {organizations.map((organization) => (
        <OrganizationOverviewSection
          key={organization.id}
          organization={organization}
        />
      ))}
    </div>
  );
}

const HELP =
  "What is going on across your projects: which ones receive data, which need attention (no data yet, stale, v4 migration, usage near the plan limit), and your access in each organization.";

/**
 * The projects overview: `/organizations` for all of a user's organizations,
 * `/organization/[organizationId]` for one. It is where `/` sends a user who
 * has no usable last project, and the "Overview" entry of the sidebar.
 */
export function ProjectsOverviewPage() {
  const router = useRouter();
  const session = useSession();
  const organizationId =
    typeof router.query.organizationId === "string"
      ? router.query.organizationId
      : null;
  const { organizations, isSessionLoading } = useProjectsOverview();
  const isV4MigrationShown = useV4UpgradeUiEnabled();
  const migrationBanner = useV4MigrationBannerState(isV4MigrationShown);
  const [query, setQuery] = useQueryParams({
    search: withDefault(StringParam, ""),
    status: withDefault(StringParam, "all"),
    notice: StringParam,
  });
  const status = isStatusFilter(query.status) ? query.status : "all";
  const notice = isLandingNotice(query.notice) ? query.notice : null;

  if (isSessionLoading) {
    return (
      <ContainerPage headerProps={{ title: "Overview" }}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ContainerPage>
    );
  }

  const scoped = organizationId
    ? organizations.filter((organization) => organization.id === organizationId)
    : organizations;
  const singleOrganization = organizationId ? scoped[0] : null;
  if (organizationId && !singleOrganization) {
    return (
      <ErrorPage
        title="Organization not found"
        message="This organization does not exist or you do not have access to it."
      />
    );
  }

  const canCreateOrganizations =
    session.data?.user?.canCreateOrganizations === true;
  const { organizations: visible, counts } = filterProjectsOverview(scoped, {
    search: query.search,
    status,
  });
  const headerActions = singleOrganization ? (
    <OrganizationActions organizationId={singleOrganization.id} />
  ) : (
    canCreateOrganizations && (
      <Button
        href={createOrganizationRoute}
        text="New organization"
        icon={Plus}
        variant="outline"
        size="sm"
      />
    )
  );

  return (
    <ContainerPage
      headerProps={{
        title: singleOrganization?.name ?? "All organizations",
        help: { description: HELP },
        actionButtonsRight: headerActions,
      }}
    >
      <div className="flex flex-col gap-6 pb-10">
        {notice ? (
          <LandingNoticeCallout
            notice={notice}
            onDismiss={() => setQuery({ notice: undefined }, "replaceIn")}
          />
        ) : null}
        {isV4MigrationShown && migrationBanner.projectsNeedingMigration > 0 ? (
          <V4MigrationBanner
            projectsNeedingMigration={migrationBanner.projectsNeedingMigration}
            totalProjects={migrationBanner.totalProjects}
          />
        ) : null}
        {scoped.length === 0 ? (
          <NoOrganizationState
            canCreateOrganizations={canCreateOrganizations}
          />
        ) : (
          <>
            {singleOrganization ? (
              <OrganizationSignals organization={singleOrganization} />
            ) : null}
            <Tabs
              value={status}
              onValueChange={(value) =>
                setQuery(
                  { status: value === "all" ? undefined : value },
                  "replaceIn",
                )
              }
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="overflow-x-auto">
                    <Tabs.List
                      variant="inset"
                      size="md"
                      aria-label="Filter projects"
                    >
                      <Tabs.Trigger
                        value="all"
                        label="All projects"
                        count={counts.all}
                      />
                      <Tabs.Trigger
                        value="attention"
                        label="Needs attention"
                        count={counts.attention}
                      />
                      <Tabs.Trigger
                        value="not-set-up"
                        label="Not set up"
                        count={counts["not-set-up"]}
                      />
                    </Tabs.List>
                  </div>
                  <div className="w-full sm:w-64">
                    <SearchInput
                      value={query.search}
                      onChange={(search) =>
                        setQuery({ search: search || undefined }, "replaceIn")
                      }
                      onSubmit={(search) =>
                        setQuery({ search: search || undefined }, "replaceIn")
                      }
                      placeholder="Search projects"
                    />
                  </div>
                </div>
                <Tabs.Content value={status}>
                  <OverviewResults
                    organizations={visible}
                    isSingleOrganization={singleOrganization !== null}
                  />
                </Tabs.Content>
              </div>
            </Tabs>
          </>
        )}
      </div>
    </ContainerPage>
  );
}
