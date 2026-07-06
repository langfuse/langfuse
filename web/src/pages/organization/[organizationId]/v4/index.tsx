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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
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
  getV4ProjectRequiredActionCount,
  getV4MigrationStatus,
  MAX_V4_TIMELINE_RANGE_MS,
  splitV4ProjectsByRequiredChanges,
  V4_MIGRATION_DEADLINE_SHORT_LABEL,
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

type ProjectSdkUsageSummary = {
  projectId: string;
  outdatedSdkUsageSeriesCount: number;
};

type ProjectReadinessRow = ProjectSummary & {
  traceLevelEvalCount: number;
  legacyApiEntrypointCount: number;
  legacyApiUsageCount: number;
  outdatedSdkUsageSeriesCount: number;
  requiredActionCount: number;
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

const ProjectReadinessTable = ({
  rows,
  selectedProjectId,
  onSelectProject,
  isStatusPending,
  hasStatusError,
  isTraceLevelEvalSummaryLoading,
  hasTraceLevelEvalSummaryError,
  isLegacyApiUsageLoading,
  hasLegacyApiUsageError,
  isSdkUsageLoading,
  hasSdkUsageError,
}: {
  rows: ProjectReadinessRow[];
  selectedProjectId: string | undefined;
  onSelectProject: (projectId: string) => void;
  isStatusPending: boolean;
  hasStatusError: boolean;
  isTraceLevelEvalSummaryLoading: boolean;
  hasTraceLevelEvalSummaryError: boolean;
  isLegacyApiUsageLoading: boolean;
  hasLegacyApiUsageError: boolean;
  isSdkUsageLoading: boolean;
  hasSdkUsageError: boolean;
}) => (
  <div className="overflow-x-auto">
    <Table className="min-w-[68rem] table-auto">
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-32 text-right">Trace evals</TableHead>
          <TableHead className="w-32 text-right">Integrations</TableHead>
          <TableHead className="w-44 text-right">Public API</TableHead>
          <TableHead className="w-32 text-right">SDKs</TableHead>
          <TableHead className="w-32" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((project) => {
          const migrationStatus =
            isStatusPending || hasStatusError
              ? null
              : getV4MigrationStatus(project.requiredActionCount);
          const isSelected = selectedProjectId === project.projectId;

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
                  variant={migrationStatus?.badgeVariant ?? "outline-solid"}
                  size="sm"
                >
                  {hasStatusError
                    ? "Unavailable"
                    : (migrationStatus?.label ?? "Loading")}
                </Badge>
              </TableCell>
              <TableCell density="comfortable" className="text-right">
                {isTraceLevelEvalSummaryLoading
                  ? "Loading..."
                  : hasTraceLevelEvalSummaryError
                    ? "Failed"
                    : numberFormatter(project.traceLevelEvalCount, 0)}
              </TableCell>
              <TableCell density="comfortable" className="text-right">
                {numberFormatter(project.legacyIntegrationCount, 0)}
              </TableCell>
              <TableCell density="comfortable" className="text-right">
                {isLegacyApiUsageLoading
                  ? "Loading..."
                  : hasLegacyApiUsageError
                    ? "Failed"
                    : project.legacyApiEntrypointCount > 0
                      ? `${numberFormatter(
                          project.legacyApiEntrypointCount,
                          0,
                        )} routes - ${numberFormatter(
                          project.legacyApiUsageCount,
                          0,
                          2,
                        )} calls`
                      : "0"}
              </TableCell>
              <TableCell density="comfortable" className="text-right">
                {isSdkUsageLoading
                  ? "Loading..."
                  : hasSdkUsageError
                    ? "Failed"
                    : project.outdatedSdkUsageSeriesCount > 0
                      ? `${numberFormatter(
                          project.outdatedSdkUsageSeriesCount,
                          0,
                        )} outdated`
                      : "0"}
              </TableCell>
              <TableCell density="comfortable">
                <Button
                  variant={isSelected ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onSelectProject(project.projectId)}
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
);

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

  const sdkUsageSummaryByProject =
    api.v4Transition.sdkUsageSummaryByProject.useQuery(
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

  const projects = useMemo<ProjectSummary[]>(
    () => summaryByProject.data?.projects ?? [],
    [summaryByProject.data?.projects],
  );
  const legacyApiUsageRows = useMemo<ProjectScopedLegacyApiUsageSummary[]>(
    () => legacyApiUsageSummaryByProject.data ?? [],
    [legacyApiUsageSummaryByProject.data],
  );
  const traceLevelEvalRows = useMemo<ProjectTraceLevelEvalSummary[]>(
    () => traceLevelEvalSummaryByProject.data ?? [],
    [traceLevelEvalSummaryByProject.data],
  );
  const sdkUsageRows = useMemo<ProjectSdkUsageSummary[]>(
    () => sdkUsageSummaryByProject.data ?? [],
    [sdkUsageSummaryByProject.data],
  );

  const legacyApiUsageRowsByProjectId = useMemo(
    () =>
      groupByProjectId<ProjectScopedLegacyApiUsageSummary>(legacyApiUsageRows),
    [legacyApiUsageRows],
  );
  const traceLevelEvalCountsByProjectId = useMemo(
    () =>
      new Map(
        traceLevelEvalRows.map((row) => [
          row.projectId,
          row.traceLevelEvalCount,
        ]),
      ),
    [traceLevelEvalRows],
  );
  const outdatedSdkUsageSeriesCountsByProjectId = useMemo(
    () =>
      new Map(
        sdkUsageRows.map((row) => [
          row.projectId,
          row.outdatedSdkUsageSeriesCount,
        ]),
      ),
    [sdkUsageRows],
  );

  const projectReadinessRows = useMemo(
    () =>
      projects
        .map((project): ProjectReadinessRow => {
          const legacyApiRows = legacyApiUsageRowsByProjectId.get(
            project.projectId,
          );
          const traceLevelEvalCount =
            traceLevelEvalCountsByProjectId.get(project.projectId) ?? 0;
          const legacyApiEntrypointCount =
            countLegacyApiEntrypoints(legacyApiRows);
          const outdatedSdkUsageSeriesCount =
            outdatedSdkUsageSeriesCountsByProjectId.get(project.projectId) ?? 0;
          const requiredActionCount = getV4ProjectRequiredActionCount({
            traceLevelEvalCount,
            legacyIntegrationCount: project.legacyIntegrationCount,
            legacyApiEntrypointCount,
            outdatedSdkUsageSeriesCount,
          });

          return {
            ...project,
            traceLevelEvalCount,
            legacyApiEntrypointCount,
            legacyApiUsageCount: sumLegacyApiUsage(legacyApiRows),
            outdatedSdkUsageSeriesCount,
            requiredActionCount,
          };
        })
        .sort((a, b) => {
          if (b.requiredActionCount !== a.requiredActionCount) {
            return b.requiredActionCount - a.requiredActionCount;
          }
          return a.projectName.localeCompare(b.projectName);
        }),
    [
      projects,
      legacyApiUsageRowsByProjectId,
      outdatedSdkUsageSeriesCountsByProjectId,
      traceLevelEvalCountsByProjectId,
    ],
  );
  const { projectsWithRequiredChanges, projectsWithoutRequiredChanges } =
    useMemo(
      () => splitV4ProjectsByRequiredChanges(projectReadinessRows),
      [projectReadinessRows],
    );
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | undefined
  >();
  const selectedProject = useMemo(
    () =>
      projectReadinessRows.find(
        (project) => project.projectId === selectedProjectId,
      ) ?? projectReadinessRows[0],
    [projectReadinessRows, selectedProjectId],
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

  const selectedProjectSdkUsage = api.v4Transition.sdkUsageTimeSeries.useQuery(
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
    return projectReadinessRows.reduce(
      (summary, project) => {
        return {
          projectsNotMigrated:
            summary.projectsNotMigrated +
            (project.requiredActionCount > 0 ? 1 : 0),
          actionCount: summary.actionCount + project.requiredActionCount,
        };
      },
      { projectsNotMigrated: 0, actionCount: 0 },
    );
  }, [projectReadinessRows]);
  const isProjectReadinessLoading =
    summaryByProject.isPending ||
    legacyApiUsageSummaryByProject.isPending ||
    sdkUsageSummaryByProject.isPending ||
    traceLevelEvalSummaryByProject.isPending;
  const hasProjectReadinessError =
    Boolean(summaryByProject.error) ||
    Boolean(legacyApiUsageSummaryByProject.error) ||
    Boolean(sdkUsageSummaryByProject.error) ||
    Boolean(traceLevelEvalSummaryByProject.error);

  useEffect(() => {
    if (
      selectedProjectId &&
      projectReadinessRows.some((p) => p.projectId === selectedProjectId)
    ) {
      return;
    }

    setSelectedProjectId(projectReadinessRows[0]?.projectId);
  }, [projectReadinessRows, selectedProjectId]);

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
          className="border-0 bg-transparent shadow-none"
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
                    projectReadinessRows.length,
                    0,
                  )} projects not migrated - ${numberFormatter(
                    migrationSummary.actionCount,
                    0,
                  )} required changes`
          }
          isLoading={isProjectReadinessLoading}
          headerRight={
            isProjectReadinessLoading ? undefined : (
              <Badge variant="warning" className="whitespace-nowrap">
                {V4_MIGRATION_DEADLINE_SHORT_LABEL}
              </Badge>
            )
          }
          headerClassName="px-0 pt-0"
          cardContentClassName="px-0 pb-0"
        >
          {summaryByProject.error ? (
            <Alert>
              <AlertDescription>Failed to load projects.</AlertDescription>
            </Alert>
          ) : isProjectReadinessLoading ? (
            <div className="min-h-40" />
          ) : projectReadinessRows.length > 0 ? (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">
                    Projects with required changes
                  </h3>
                  <Badge variant="outline-solid" size="sm">
                    {numberFormatter(projectsWithRequiredChanges.length, 0)}
                  </Badge>
                </div>
                {projectsWithRequiredChanges.length ? (
                  <ProjectReadinessTable
                    rows={projectsWithRequiredChanges}
                    selectedProjectId={selectedProject?.projectId}
                    onSelectProject={setSelectedProjectId}
                    isStatusPending={
                      legacyApiUsageSummaryByProject.isPending ||
                      sdkUsageSummaryByProject.isPending ||
                      traceLevelEvalSummaryByProject.isPending
                    }
                    hasStatusError={
                      Boolean(legacyApiUsageSummaryByProject.error) ||
                      Boolean(sdkUsageSummaryByProject.error) ||
                      Boolean(traceLevelEvalSummaryByProject.error)
                    }
                    isTraceLevelEvalSummaryLoading={
                      traceLevelEvalSummaryByProject.isPending
                    }
                    hasTraceLevelEvalSummaryError={Boolean(
                      traceLevelEvalSummaryByProject.error,
                    )}
                    isLegacyApiUsageLoading={
                      legacyApiUsageSummaryByProject.isPending
                    }
                    hasLegacyApiUsageError={Boolean(
                      legacyApiUsageSummaryByProject.error,
                    )}
                    isSdkUsageLoading={sdkUsageSummaryByProject.isPending}
                    hasSdkUsageError={Boolean(sdkUsageSummaryByProject.error)}
                  />
                ) : (
                  <Alert>
                    <AlertDescription>
                      No projects with required v4 migration changes.
                    </AlertDescription>
                  </Alert>
                )}
              </section>

              {projectsWithoutRequiredChanges.length ? (
                <Accordion type="single" collapsible className="pt-1">
                  <AccordionItem value="migrated" className="border-b-0">
                    <AccordionTrigger className="py-3 text-sm hover:no-underline">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-medium">
                          Projects without required changes
                        </span>
                        <Badge variant="outline-solid" size="sm">
                          {numberFormatter(
                            projectsWithoutRequiredChanges.length,
                            0,
                          )}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1">
                      <ProjectReadinessTable
                        rows={projectsWithoutRequiredChanges}
                        selectedProjectId={selectedProject?.projectId}
                        onSelectProject={setSelectedProjectId}
                        isStatusPending={
                          legacyApiUsageSummaryByProject.isPending ||
                          sdkUsageSummaryByProject.isPending ||
                          traceLevelEvalSummaryByProject.isPending
                        }
                        hasStatusError={
                          Boolean(legacyApiUsageSummaryByProject.error) ||
                          Boolean(sdkUsageSummaryByProject.error) ||
                          Boolean(traceLevelEvalSummaryByProject.error)
                        }
                        isTraceLevelEvalSummaryLoading={
                          traceLevelEvalSummaryByProject.isPending
                        }
                        hasTraceLevelEvalSummaryError={Boolean(
                          traceLevelEvalSummaryByProject.error,
                        )}
                        isLegacyApiUsageLoading={
                          legacyApiUsageSummaryByProject.isPending
                        }
                        hasLegacyApiUsageError={Boolean(
                          legacyApiUsageSummaryByProject.error,
                        )}
                        isSdkUsageLoading={sdkUsageSummaryByProject.isPending}
                        hasSdkUsageError={Boolean(
                          sdkUsageSummaryByProject.error,
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
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
            sdkUsage={selectedProjectSdkUsage.data}
            isLegacyIntegrationSummaryLoading={summaryByProject.isPending}
            isTraceLevelEvalSummaryLoading={
              traceLevelEvalSummaryByProject.isPending
            }
            isLegacyApiUsageLoading={selectedProjectLegacyApiUsage.isPending}
            isTraceLevelEvalExecutionsLoading={
              selectedProjectTraceLevelEvalExecutions.isPending
            }
            isSdkUsageLoading={selectedProjectSdkUsage.isPending}
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
            hasSdkUsageError={Boolean(selectedProjectSdkUsage.error)}
          />
        ) : null}
      </div>
    </Page>
  );
}
