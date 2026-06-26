import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Page from "@/src/components/layouts/page";
import { ErrorPage } from "@/src/components/error-page";
import { TimeRangePicker } from "@/src/components/date-picker";
import {
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  toAbsoluteTimeRange,
  type AbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import { api } from "@/src/utils/api";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { numberFormatter } from "@/src/utils/numbers";
import {
  getTraceLevelEvalsHref,
  ProductLinkButton,
  V4MigrationProjectCards,
  type V4LegacyApiUsagePoint,
  type V4MigrationSummary,
  type V4TraceLevelEvalExecutionPoint,
} from "@/src/features/v4/components/V4MigrationProjectCards";

type ProjectSummary = V4MigrationSummary & {
  projectId: string;
  projectName: string;
};

type ProjectScopedLegacyApiUsagePoint = V4LegacyApiUsagePoint & {
  projectId: string;
};

type ProjectScopedEvalExecutionPoint = V4TraceLevelEvalExecutionPoint & {
  projectId: string;
};

const V4_TIME_RANGE_PRESETS = [
  "last5Minutes",
  "last30Minutes",
  "last1Hour",
  "last3Hours",
  "last1Day",
  "last7Days",
  "last30Days",
] as const;

const MAX_V4_TIMELINE_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

const getCappedAbsoluteTimeRange = (
  timeRange: TimeRange,
): AbsoluteTimeRange => {
  const absoluteRange =
    toAbsoluteTimeRange(timeRange) ??
    ({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(),
    } satisfies AbsoluteTimeRange);

  if (
    absoluteRange.to.getTime() - absoluteRange.from.getTime() <=
    MAX_V4_TIMELINE_RANGE_MS
  ) {
    return absoluteRange;
  }

  return {
    from: new Date(absoluteRange.to.getTime() - MAX_V4_TIMELINE_RANGE_MS),
    to: absoluteRange.to,
  };
};

const groupByProjectId = <T extends { projectId: string }>(
  rows: T[] | undefined,
): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();

  for (const row of rows ?? []) {
    const projectRows = grouped.get(row.projectId) ?? [];
    projectRows.push(row);
    grouped.set(row.projectId, projectRows);
  }

  return grouped;
};

const sumLegacyApiUsage = (
  rows: ProjectScopedLegacyApiUsagePoint[] | undefined,
): number => rows?.reduce((total, row) => total + row.count, 0) ?? 0;

const getProjectActionCount = (
  project: ProjectSummary,
  legacyApiUsageCount: number,
): number =>
  project.traceLevelEvalCount +
  project.legacyIntegrationCount +
  legacyApiUsageCount;

export default function OrganizationV4Page() {
  const router = useRouter();
  const session = useSession();
  const organizationId = router.query.organizationId as string | undefined;
  const { timeRange, setTimeRange } = useGlobalDateRange({
    allowedRanges: V4_TIME_RANGE_PRESETS,
    fallback: DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  });
  const sessionUser = session.data?.user;
  const organizationRole = sessionUser?.admin
    ? "OWNER"
    : sessionUser?.organizations.find(
        (organization) => organization.id === organizationId,
      )?.role;
  const canViewOrgV4Page =
    organizationRole === "OWNER" || organizationRole === "ADMIN";

  const absoluteTimeRange = useMemo(() => {
    return getCappedAbsoluteTimeRange(timeRange);
  }, [timeRange]);

  const earliestSelectableDate = useMemo(
    () => new Date(Date.now() - MAX_V4_TIMELINE_RANGE_MS),
    [],
  );

  const summaryByProject = api.v4Transition.summaryByProject.useQuery(
    {
      orgId: organizationId ?? "",
    },
    {
      enabled: Boolean(organizationId) && canViewOrgV4Page,
    },
  );

  const legacyApiUsageByProject =
    api.v4Transition.timeSeriesByEntrypointByProject.useQuery(
      {
        orgId: organizationId ?? "",
        fromTimestamp: absoluteTimeRange.from,
        toTimestamp: absoluteTimeRange.to,
        granularity: "auto",
      },
      {
        enabled: Boolean(organizationId) && canViewOrgV4Page,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
      },
    );

  const traceLevelEvalExecutionsByProject =
    api.v4Transition.traceLevelEvalExecutionsTimeSeriesByProject.useQuery(
      {
        orgId: organizationId ?? "",
        fromTimestamp: absoluteTimeRange.from,
        toTimestamp: absoluteTimeRange.to,
        granularity: "auto",
      },
      {
        enabled: Boolean(organizationId) && canViewOrgV4Page,
      },
    );

  const legacyApiUsageRowsByProjectId = useMemo(
    () =>
      groupByProjectId<ProjectScopedLegacyApiUsagePoint>(
        legacyApiUsageByProject.data,
      ),
    [legacyApiUsageByProject.data],
  );
  const evalExecutionRowsByProjectId = useMemo(
    () =>
      groupByProjectId<ProjectScopedEvalExecutionPoint>(
        traceLevelEvalExecutionsByProject.data,
      ),
    [traceLevelEvalExecutionsByProject.data],
  );

  const projects = useMemo(
    () =>
      [...(summaryByProject.data?.projects ?? [])].sort((a, b) => {
        const bActionCount = getProjectActionCount(
          b,
          sumLegacyApiUsage(legacyApiUsageRowsByProjectId.get(b.projectId)),
        );
        const aActionCount = getProjectActionCount(
          a,
          sumLegacyApiUsage(legacyApiUsageRowsByProjectId.get(a.projectId)),
        );

        if (bActionCount !== aActionCount) return bActionCount - aActionCount;
        return a.projectName.localeCompare(b.projectName);
      }),
    [summaryByProject.data?.projects, legacyApiUsageRowsByProjectId],
  );

  if (!organizationId || session.status === "loading") return null;

  if (!canViewOrgV4Page) {
    return <ErrorPage title="Not found" message="This page does not exist." />;
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "V4",
        breadcrumb: [
          { name: "Projects", href: `/organization/${organizationId}` },
        ],
        actionButtonsLeft: (
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={V4_TIME_RANGE_PRESETS}
            disabled={{ before: earliestSelectableDate }}
            maxRangeMs={MAX_V4_TIMELINE_RANGE_MS}
            className="my-0 max-w-full overflow-x-auto"
          />
        ),
      }}
    >
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6">
        <DashboardCard
          title="Projects"
          description="V4 migration signals split by project."
          isLoading={
            summaryByProject.isPending || legacyApiUsageByProject.isPending
          }
        >
          {summaryByProject.error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive flex min-h-28 items-center rounded-md border p-4 text-sm">
              Failed to load projects.
            </div>
          ) : projects.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[56rem] table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="w-36 text-right">
                      Trace evals
                    </TableHead>
                    <TableHead className="w-36 text-right">
                      Integrations
                    </TableHead>
                    <TableHead className="w-36 text-right">
                      Public API
                    </TableHead>
                    <TableHead className="w-[24rem]">Links</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => {
                    const legacyApiUsageCount = sumLegacyApiUsage(
                      legacyApiUsageRowsByProjectId.get(project.projectId),
                    );

                    return (
                      <TableRow key={project.projectId}>
                        <TableCell density="comfortable">
                          <Link
                            href={`/project/${project.projectId}`}
                            className="font-medium hover:underline"
                          >
                            {project.projectName}
                          </Link>
                        </TableCell>
                        <TableCell density="comfortable" className="text-right">
                          {numberFormatter(project.traceLevelEvalCount, 0)}
                        </TableCell>
                        <TableCell density="comfortable" className="text-right">
                          {numberFormatter(project.legacyIntegrationCount, 0)}
                        </TableCell>
                        <TableCell density="comfortable" className="text-right">
                          {legacyApiUsageByProject.error
                            ? "Failed"
                            : numberFormatter(legacyApiUsageCount, 0, 2)}
                        </TableCell>
                        <TableCell density="comfortable">
                          <div className="flex flex-wrap gap-2">
                            <ProductLinkButton
                              href={`/project/${project.projectId}/v4`}
                            >
                              V4 page
                            </ProductLinkButton>
                            <ProductLinkButton
                              href={getTraceLevelEvalsHref(project.projectId)}
                            >
                              Evals
                            </ProductLinkButton>
                            <ProductLinkButton
                              href={`/project/${project.projectId}/settings/integrations`}
                            >
                              Integrations
                            </ProductLinkButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <NoDataOrLoading
              isLoading={summaryByProject.isPending}
              description="No active projects were found in this organization."
              className="min-h-40"
            />
          )}
        </DashboardCard>

        {projects.map((project) => (
          <section key={project.projectId} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">
                  {project.projectName}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <ProductLinkButton href={`/project/${project.projectId}/v4`}>
                  Project V4 page
                </ProductLinkButton>
              </div>
            </div>

            <V4MigrationProjectCards
              projectId={project.projectId}
              summary={project}
              legacyApiUsage={legacyApiUsageRowsByProjectId.get(
                project.projectId,
              )}
              traceLevelEvalExecutions={evalExecutionRowsByProjectId.get(
                project.projectId,
              )}
              isSummaryLoading={summaryByProject.isPending}
              isLegacyApiUsageLoading={legacyApiUsageByProject.isPending}
              isTraceLevelEvalExecutionsLoading={
                traceLevelEvalExecutionsByProject.isPending
              }
              hasSummaryError={Boolean(summaryByProject.error)}
              hasLegacyApiUsageError={Boolean(legacyApiUsageByProject.error)}
              hasTraceLevelEvalExecutionsError={Boolean(
                traceLevelEvalExecutionsByProject.error,
              )}
            />
          </section>
        ))}
      </div>
    </Page>
  );
}
