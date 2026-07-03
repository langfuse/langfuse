import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { v4MigrationOrgScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import Page from "@/src/components/layouts/page";
import { ErrorPage } from "@/src/components/error-page";
import { TimeRangePicker } from "@/src/components/date-picker";
import { DEFAULT_DASHBOARD_AGGREGATION_SELECTION } from "@/src/utils/date-range-utils";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import { api } from "@/src/utils/api";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
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
  V4MigrationProjectCards,
  type V4LegacyIntegrationSummary,
} from "@/src/features/v4/components/V4MigrationProjectCards";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  countLegacyApiEntrypoints,
  getCappedAbsoluteTimeRange,
  getV4MigrationStatus,
  MAX_V4_TIMELINE_RANGE_MS,
  V4_TIME_RANGE_PRESETS,
} from "@/src/features/v4/utils";
import { cn } from "@/src/utils/tailwind";

type ProjectSummary = V4LegacyIntegrationSummary & {
  projectId: string;
  projectName: string;
};

type ProjectScopedLegacyApiUsageSummary = {
  projectId: string;
  entrypoint: string;
  count: number;
};

type ProjectTraceLevelEvalSummary = {
  projectId: string;
  traceLevelEvalCount: number;
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
  rows: Array<{ count: number }> | undefined,
): number => rows?.reduce((total, row) => total + row.count, 0) ?? 0;

const getProjectActionCount = (
  project: ProjectSummary,
  traceLevelEvalCount: number,
  legacyApiEntrypointCount: number,
): number =>
  traceLevelEvalCount +
  project.legacyIntegrationCount +
  legacyApiEntrypointCount;

export default function OrganizationV4Page() {
  const router = useRouter();
  const session = useSession();
  const organizationId = router.query.organizationId as string | undefined;
  const { timeRange, setTimeRange } = useGlobalDateRange({
    allowedRanges: V4_TIME_RANGE_PRESETS,
    fallback: DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  });
  const canViewOrgV4Page = useHasOrganizationAccess({
    organizationId,
    scope: v4MigrationOrgScope,
  });

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

  const legacyApiUsageSummaryByProject =
    api.v4Transition.legacyApiUsageSummaryByProject.useQuery(
      {
        orgId: organizationId ?? "",
        fromTimestamp: absoluteTimeRange.from,
        toTimestamp: absoluteTimeRange.to,
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

  const traceLevelEvalSummaryByProject =
    api.v4Transition.traceLevelEvalSummaryByProject.useQuery(
      {
        orgId: organizationId ?? "",
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

  const legacyApiUsageRowsByProjectId = useMemo(
    () =>
      groupByProjectId<ProjectScopedLegacyApiUsageSummary>(
        legacyApiUsageSummaryByProject.data,
      ),
    [legacyApiUsageSummaryByProject.data],
  );
  const traceLevelEvalCountsByProjectId = useMemo(
    () =>
      new Map(
        (traceLevelEvalSummaryByProject.data ?? []).map(
          (row: ProjectTraceLevelEvalSummary) => [
            row.projectId,
            row.traceLevelEvalCount,
          ],
        ),
      ),
    [traceLevelEvalSummaryByProject.data],
  );

  const projects = useMemo(
    () =>
      [...(summaryByProject.data?.projects ?? [])].sort((a, b) => {
        const bActionCount = getProjectActionCount(
          b,
          traceLevelEvalCountsByProjectId.get(b.projectId) ?? 0,
          countLegacyApiEntrypoints(
            legacyApiUsageRowsByProjectId.get(b.projectId),
          ),
        );
        const aActionCount = getProjectActionCount(
          a,
          traceLevelEvalCountsByProjectId.get(a.projectId) ?? 0,
          countLegacyApiEntrypoints(
            legacyApiUsageRowsByProjectId.get(a.projectId),
          ),
        );

        if (bActionCount !== aActionCount) return bActionCount - aActionCount;
        return a.projectName.localeCompare(b.projectName);
      }),
    [
      summaryByProject.data?.projects,
      legacyApiUsageRowsByProjectId,
      traceLevelEvalCountsByProjectId,
    ],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | undefined
  >();
  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectId === selectedProjectId) ??
      projects[0],
    [projects, selectedProjectId],
  );

  const selectedProjectLegacyApiUsage =
    api.v4Transition.timeSeriesByEntrypoint.useQuery(
      {
        projectId: selectedProject?.projectId ?? "",
        fromTimestamp: absoluteTimeRange.from,
        toTimestamp: absoluteTimeRange.to,
        granularity: "auto",
      },
      {
        enabled: Boolean(selectedProject?.projectId) && canViewOrgV4Page,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
      },
    );

  const selectedProjectTraceLevelEvalExecutions =
    api.v4Transition.traceLevelEvalExecutionsTimeSeries.useQuery(
      {
        projectId: selectedProject?.projectId ?? "",
        fromTimestamp: absoluteTimeRange.from,
        toTimestamp: absoluteTimeRange.to,
        granularity: "auto",
      },
      {
        enabled: Boolean(selectedProject?.projectId) && canViewOrgV4Page,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
      },
    );

  const migrationSummary = useMemo(() => {
    return projects.reduce(
      (summary, project) => {
        const legacyApiRows = legacyApiUsageRowsByProjectId.get(
          project.projectId,
        );
        const actionCount = getProjectActionCount(
          project,
          traceLevelEvalCountsByProjectId.get(project.projectId) ?? 0,
          countLegacyApiEntrypoints(legacyApiRows),
        );

        return {
          projectsNotMigrated:
            summary.projectsNotMigrated + (actionCount > 0 ? 1 : 0),
          actionCount: summary.actionCount + actionCount,
        };
      },
      { projectsNotMigrated: 0, actionCount: 0 },
    );
  }, [
    legacyApiUsageRowsByProjectId,
    projects,
    traceLevelEvalCountsByProjectId,
  ]);
  const isProjectListLoading = summaryByProject.isPending;
  const isProjectReadinessLoading =
    summaryByProject.isPending ||
    legacyApiUsageSummaryByProject.isPending ||
    traceLevelEvalSummaryByProject.isPending;
  const hasProjectReadinessError =
    Boolean(summaryByProject.error) ||
    Boolean(legacyApiUsageSummaryByProject.error) ||
    Boolean(traceLevelEvalSummaryByProject.error);

  useEffect(() => {
    if (
      selectedProjectId &&
      projects.some((p) => p.projectId === selectedProjectId)
    ) {
      return;
    }

    setSelectedProjectId(projects[0]?.projectId);
  }, [projects, selectedProjectId]);

  if (!organizationId || session.status === "loading") return null;

  if (!canViewOrgV4Page) {
    return <ErrorPage title="Not found" message="This page does not exist." />;
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Migrate to v4",
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
          title="Project readiness"
          description={
            isProjectReadinessLoading
              ? "Loading V4 migration data."
              : hasProjectReadinessError
                ? "Some project readiness data could not be loaded."
                : `${numberFormatter(
                    migrationSummary.projectsNotMigrated,
                    0,
                  )} of ${numberFormatter(
                    projects.length,
                    0,
                  )} projects not migrated - ${numberFormatter(
                    migrationSummary.actionCount,
                    0,
                  )} required changes`
          }
          isLoading={isProjectReadinessLoading}
        >
          {summaryByProject.error ? (
            <Alert>
              <AlertDescription>Failed to load projects.</AlertDescription>
            </Alert>
          ) : isProjectListLoading ? (
            <div className="min-h-40" />
          ) : projects.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[60rem] table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-32 text-right">
                      Trace evals
                    </TableHead>
                    <TableHead className="w-32 text-right">
                      Integrations
                    </TableHead>
                    <TableHead className="w-44 text-right">
                      Public API
                    </TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => {
                    const legacyApiRows = legacyApiUsageRowsByProjectId.get(
                      project.projectId,
                    );
                    const legacyApiUsageCount =
                      sumLegacyApiUsage(legacyApiRows);
                    const legacyApiEntrypointCount =
                      countLegacyApiEntrypoints(legacyApiRows);
                    const actionCount = getProjectActionCount(
                      project,
                      traceLevelEvalCountsByProjectId.get(project.projectId) ??
                        0,
                      legacyApiEntrypointCount,
                    );
                    const traceLevelEvalCount =
                      traceLevelEvalCountsByProjectId.get(project.projectId) ??
                      0;
                    const isStatusPending =
                      legacyApiUsageSummaryByProject.isPending ||
                      traceLevelEvalSummaryByProject.isPending;
                    const hasStatusError =
                      Boolean(legacyApiUsageSummaryByProject.error) ||
                      Boolean(traceLevelEvalSummaryByProject.error);
                    const migrationStatus =
                      isStatusPending || hasStatusError
                        ? null
                        : getV4MigrationStatus(actionCount);
                    const isSelected =
                      selectedProject?.projectId === project.projectId;

                    return (
                      <TableRow
                        key={project.projectId}
                        className={cn(isSelected && "bg-muted/40")}
                      >
                        <TableCell density="comfortable">
                          <Link
                            href={`/project/${project.projectId}`}
                            className="font-medium hover:underline"
                          >
                            {project.projectName}
                          </Link>
                        </TableCell>
                        <TableCell density="comfortable">
                          <Badge
                            variant={
                              migrationStatus?.badgeVariant ?? "outline-solid"
                            }
                            size="sm"
                          >
                            {hasStatusError
                              ? "Unavailable"
                              : (migrationStatus?.label ?? "Loading")}
                          </Badge>
                        </TableCell>
                        <TableCell density="comfortable" className="text-right">
                          {traceLevelEvalSummaryByProject.isPending
                            ? "Loading..."
                            : traceLevelEvalSummaryByProject.error
                              ? "Failed"
                              : numberFormatter(traceLevelEvalCount, 0)}
                        </TableCell>
                        <TableCell density="comfortable" className="text-right">
                          {numberFormatter(project.legacyIntegrationCount, 0)}
                        </TableCell>
                        <TableCell density="comfortable" className="text-right">
                          {legacyApiUsageSummaryByProject.isPending
                            ? "Loading..."
                            : legacyApiUsageSummaryByProject.error
                              ? "Failed"
                              : legacyApiEntrypointCount > 0
                                ? `${numberFormatter(
                                    legacyApiEntrypointCount,
                                    0,
                                  )} routes - ${numberFormatter(
                                    legacyApiUsageCount,
                                    0,
                                    2,
                                  )} calls`
                                : "0"}
                        </TableCell>
                        <TableCell density="comfortable">
                          <Button
                            variant={isSelected ? "secondary" : "outline"}
                            size="sm"
                            onClick={() =>
                              setSelectedProjectId(project.projectId)
                            }
                            className="w-full"
                          >
                            Details
                          </Button>
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
            />
          )}
        </DashboardCard>

        {selectedProject ? (
          <V4MigrationProjectCards
            projectId={selectedProject.projectId}
            projectName={selectedProject.projectName}
            legacyIntegrationSummary={selectedProject}
            traceLevelEvalCount={
              traceLevelEvalCountsByProjectId.get(selectedProject.projectId) ??
              0
            }
            legacyApiUsage={selectedProjectLegacyApiUsage.data}
            traceLevelEvalExecutions={
              selectedProjectTraceLevelEvalExecutions.data
            }
            isLegacyIntegrationSummaryLoading={summaryByProject.isPending}
            isTraceLevelEvalSummaryLoading={
              traceLevelEvalSummaryByProject.isPending
            }
            isLegacyApiUsageLoading={selectedProjectLegacyApiUsage.isPending}
            isTraceLevelEvalExecutionsLoading={
              selectedProjectTraceLevelEvalExecutions.isPending
            }
            hasLegacyIntegrationSummaryError={Boolean(summaryByProject.error)}
            hasTraceLevelEvalSummaryError={Boolean(
              traceLevelEvalSummaryByProject.error,
            )}
            hasLegacyApiUsageError={Boolean(
              selectedProjectLegacyApiUsage.error,
            )}
            hasTraceLevelEvalExecutionsError={Boolean(
              selectedProjectTraceLevelEvalExecutions.error,
            )}
          />
        ) : null}
      </div>
    </Page>
  );
}
