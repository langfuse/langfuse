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
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
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
  type V4LegacyApiUsagePoint,
  type V4MigrationSummary,
  type V4TraceLevelEvalExecutionPoint,
} from "@/src/features/v4/components/V4MigrationProjectCards";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import {
  getCappedAbsoluteTimeRange,
  getV4MigrationStatus,
  MAX_V4_TIMELINE_RANGE_MS,
  V4_TIME_RANGE_PRESETS,
} from "@/src/features/v4/utils";
import { cn } from "@/src/utils/tailwind";

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

const countLegacyApiEntrypoints = (
  rows: ProjectScopedLegacyApiUsagePoint[] | undefined,
): number =>
  new Set(rows?.filter((row) => row.entrypoint).map((row) => row.entrypoint))
    .size;

const getProjectActionCount = (
  project: ProjectSummary,
  legacyApiEntrypointCount: number,
): number =>
  project.traceLevelEvalCount +
  project.legacyIntegrationCount +
  legacyApiEntrypointCount;

export default function OrganizationV4Page() {
  const router = useRouter();
  const session = useSession();
  const organizationId = router.query.organizationId as string | undefined;
  const { timeRange, setTimeRange } = useDashboardDateRange({
    defaultRelativeAggregation: DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
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
          countLegacyApiEntrypoints(
            legacyApiUsageRowsByProjectId.get(b.projectId),
          ),
        );
        const aActionCount = getProjectActionCount(
          a,
          countLegacyApiEntrypoints(
            legacyApiUsageRowsByProjectId.get(a.projectId),
          ),
        );

        if (bActionCount !== aActionCount) return bActionCount - aActionCount;
        return a.projectName.localeCompare(b.projectName);
      }),
    [summaryByProject.data?.projects, legacyApiUsageRowsByProjectId],
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
  const migrationSummary = useMemo(() => {
    return projects.reduce(
      (summary, project) => {
        const legacyApiRows = legacyApiUsageRowsByProjectId.get(
          project.projectId,
        );
        const actionCount = getProjectActionCount(
          project,
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
  }, [legacyApiUsageRowsByProjectId, projects]);

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
          description={`${numberFormatter(
            migrationSummary.projectsNotMigrated,
            0,
          )} of ${numberFormatter(
            projects.length,
            0,
          )} projects not migrated - ${numberFormatter(
            migrationSummary.actionCount,
            0,
          )} required changes`}
          isLoading={
            summaryByProject.isPending || legacyApiUsageByProject.isPending
          }
        >
          {summaryByProject.error ? (
            <Alert>
              <AlertDescription>Failed to load projects.</AlertDescription>
            </Alert>
          ) : summaryByProject.isPending ||
            legacyApiUsageByProject.isPending ? (
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
                      legacyApiEntrypointCount,
                    );
                    const migrationStatus = getV4MigrationStatus(actionCount);
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
                            variant={migrationStatus.badgeVariant}
                            size="sm"
                          >
                            {migrationStatus.label}
                          </Badge>
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
            summary={selectedProject}
            legacyApiUsage={legacyApiUsageRowsByProjectId.get(
              selectedProject.projectId,
            )}
            traceLevelEvalExecutions={evalExecutionRowsByProjectId.get(
              selectedProject.projectId,
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
        ) : null}
      </div>
    </Page>
  );
}
