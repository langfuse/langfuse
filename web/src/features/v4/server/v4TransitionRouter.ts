import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { AnalyticsIntegrationExportSource } from "@langfuse/shared/src/db";
import type { Prisma } from "@langfuse/shared/src/db";
import { variableMapping } from "@langfuse/shared";
import type { Session } from "next-auth";
import {
  classifyIngestionSdkAttribution,
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  isForceV3ExperienceProject,
  logger,
  queryClickhouse,
  systemTableRef,
  type IngestionSdkAttributionStatus,
  type IngestionSdkUpgradeStatus,
} from "@langfuse/shared/src/server";
import { getSdkVersionCapabilityStatus } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import {
  addTimelineBucket,
  floorTimelineBucket,
  formatTimelineBucket,
  getTimelineBucketSql,
  MAX_TIMELINE_RANGE_MS,
  resolveTimelineGranularity,
  type ResolvedTimelineGranularity,
} from "./timelineBuckets";

const timelineGranularity = z.literal("auto");

const legacyIntegrationExportSources =
  new Set<AnalyticsIntegrationExportSource>([
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
  ]);

const TRACE_EVAL_TARGET = "trace";
const DATASET_EVAL_TARGET = "dataset";

const isLegacyIntegrationExportSource = (
  exportSource: AnalyticsIntegrationExportSource | null | undefined,
) => exportSource != null && legacyIntegrationExportSources.has(exportSource);

const isEnabledLegacyIntegration = (
  integration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined,
) =>
  Boolean(
    integration?.enabled &&
    isLegacyIntegrationExportSource(integration.exportSource),
  );

const timelineInputSchema = z
  .object({
    projectId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
    granularity: timelineGranularity.default("auto"),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_TIMELINE_RANGE_MS,
    { message: "V4 timeline ranges cannot exceed 30 days" },
  );

const organizationTimeRangeInputSchema = z
  .object({
    orgId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_TIMELINE_RANGE_MS,
    { message: "V4 migration ranges cannot exceed 30 days" },
  );

type LegacyApiUsageRow = {
  time: string;
  entrypoint: string;
  count: string | number;
  lastSeen: string;
};

type LegacyApiUsageResultRow = {
  time: string;
  entrypoint: string;
  count: number;
  lastSeen: string | null;
};

type LegacyApiUsageSummaryByProjectRow = {
  projectId: string;
  entrypoint: string;
  count: string | number;
};

type LegacyApiUsageSummaryByProjectResultRow = {
  projectId: string;
  entrypoint: string;
  count: number;
};

type DecoratedSdkUsageSummaryRow = {
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  hasDelayedOtelEvents: boolean | null;
  attributionStatus: IngestionSdkAttributionStatus;
  canonicalSdkName: "python" | "javascript" | null;
  upgradeStatus: IngestionSdkUpgradeStatus | "outdated_minor";
};

type SdkUsageSummaryByProjectRow = {
  projectId: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: string | number;
  /** Hits from events_core only (count also includes score ingestions). */
  eventsCount: string | number;
  firstSeen: string;
  lastSeen: string;
  hasDelayedOtelEvents: boolean | string | number | null;
};

type SdkUsageSummaryByProjectSeries = {
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  publicKey: string;
  count: number;
  /** Hits with observation evidence: rows in events_core, excluding scores.
      Zero means the offender is scores-only and an events-table evidence
      link would open an empty result set. */
  eventsCount: number;
  firstSeen: string;
  lastSeen: string;
  hasDelayedOtelEvents: boolean | null;
  attributionStatus: IngestionSdkAttributionStatus;
  v4MigrationStatus:
    | "compatible"
    | "upgrade_recommended"
    | "upgrade_required"
    | "unknown";
};

// Counts stay out of this row on purpose: the client derives every displayed
// count from sdkUsageSeries in sdkVersionStatus.ts, so duplicating the
// predicates here would mean keeping two implementations in sync for values
// nothing reads.
type SdkUsageSummaryByProjectResultRow = {
  projectId: string;
  experimentInstrumentationMigration: {
    status:
      | "required"
      | "not_required"
      | "sdk_usage_inconclusive"
      | "check_failed";
    upgradePath: "sdk" | "api" | null;
  };
  sdkUsageSeries: SdkUsageSummaryByProjectSeries[];
};

type DatasetRunItemsPostUsageByProjectRow = {
  projectId: string;
  count: string | number;
};

const getEmptyTimelineBuckets = (
  fromTimestamp: Date,
  toTimestamp: Date,
  granularity: ResolvedTimelineGranularity,
): LegacyApiUsageResultRow[] => {
  const buckets: LegacyApiUsageResultRow[] = [];

  for (
    let bucket = floorTimelineBucket(fromTimestamp, granularity);
    bucket.getTime() < toTimestamp.getTime();
    bucket = addTimelineBucket(bucket, granularity)
  ) {
    buckets.push({
      time: formatTimelineBucket(bucket),
      entrypoint: "",
      count: 0,
      lastSeen: null,
    });
  }

  return buckets;
};

const compareTimelineRows = (
  left: LegacyApiUsageResultRow,
  right: LegacyApiUsageResultRow,
): number => {
  if (left.time < right.time) return -1;
  if (left.time > right.time) return 1;
  if (left.entrypoint === right.entrypoint) return 0;
  if (left.entrypoint === "") return -1;
  if (right.entrypoint === "") return 1;
  return left.entrypoint.localeCompare(right.entrypoint);
};

const toBoolean = (value: boolean | string | number): boolean =>
  value === true || value === 1 || value === "1";

const toNullableBoolean = (
  value: boolean | string | number | null,
): boolean | null => (value === null ? null : toBoolean(value));

type TraceLevelEvalSummaryByProjectResultRow = {
  projectId: string;
  traceLevelEvalCount: number;
};

type LegacyIntegrations = {
  posthog: boolean;
  mixpanel: boolean;
  blobStorage: boolean;
};

const getAccessibleOrganizationProjectWhere = ({
  orgId,
  session,
}: {
  orgId: string;
  session: Session;
}): Prisma.ProjectWhereInput => {
  const projectIds = session.user?.organizations
    .find((organization) => organization.id === orgId)
    ?.projects.map((project) => project.id);

  return {
    orgId,
    deletedAt: null,
    ...(session.user?.admin ? {} : { id: { in: projectIds ?? [] } }),
  };
};

const getLegacyIntegrations = ({
  posthogIntegration,
  mixpanelIntegration,
  blobStorageIntegration,
}: {
  posthogIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
  mixpanelIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
  blobStorageIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
}): LegacyIntegrations => ({
  posthog: isEnabledLegacyIntegration(posthogIntegration),
  mixpanel: isEnabledLegacyIntegration(mixpanelIntegration),
  blobStorage: isEnabledLegacyIntegration(blobStorageIntegration),
});

export const v4TransitionRouter = createTRPCRouter({
  // Whether this project is forced onto the v3 experience
  forceV3Experience: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => isForceV3ExperienceProject(input.projectId)),

  summary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [posthogIntegration, mixpanelIntegration, blobStorageIntegration] =
        await Promise.all([
          ctx.prisma.posthogIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { enabled: true, exportSource: true },
          }),
          ctx.prisma.mixpanelIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { enabled: true, exportSource: true },
          }),
          ctx.prisma.blobStorageIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { enabled: true, exportSource: true },
          }),
        ]);

      const legacyIntegrations = getLegacyIntegrations({
        posthogIntegration,
        mixpanelIntegration,
        blobStorageIntegration,
      });

      return {
        legacyIntegrationCount:
          Object.values(legacyIntegrations).filter(Boolean).length,
        legacyIntegrations,
      };
    }),

  traceLevelEvalSummary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Only active evaluators running on new data require migration;
      // inactive or backfill-only (EXISTING) configs are not counted.
      const legacyEvalConfigs = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
          targetObject: { in: [TRACE_EVAL_TARGET, DATASET_EVAL_TARGET] },
          status: "ACTIVE",
          timeScope: { has: "NEW" },
        },
        select: { targetObject: true, variableMapping: true },
      });

      // The in-app assistant can only complete the eval migration when every
      // remaining legacy evaluator is trivially repointable: dataset targets,
      // or trace targets whose variables all read from one named observation.
      const allAssistantMigratable =
        legacyEvalConfigs.length > 0 &&
        legacyEvalConfigs.every((config) => {
          if (config.targetObject === DATASET_EVAL_TARGET) return true;
          const parsed = z
            .array(variableMapping)
            .safeParse(config.variableMapping);
          if (!parsed.success || parsed.data.length === 0) return false;
          if (
            parsed.data.some((mapping) => mapping.langfuseObject === "trace")
          ) {
            return false;
          }
          const observationNames = new Set(
            parsed.data.map((mapping) => mapping.objectName ?? ""),
          );
          return observationNames.size === 1;
        });

      return {
        traceLevelEvalCount: legacyEvalConfigs.length,
        allAssistantMigratable,
      };
    }),

  summaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) {
        return { projects: [] };
      }

      const [
        posthogIntegrations,
        mixpanelIntegrations,
        blobStorageIntegrations,
      ] = await Promise.all([
        ctx.prisma.posthogIntegration.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, enabled: true, exportSource: true },
        }),
        ctx.prisma.mixpanelIntegration.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, enabled: true, exportSource: true },
        }),
        ctx.prisma.blobStorageIntegration.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, enabled: true, exportSource: true },
        }),
      ]);

      const posthogIntegrationsByProjectId = new Map(
        posthogIntegrations.map((integration) => [
          integration.projectId,
          integration,
        ]),
      );
      const mixpanelIntegrationsByProjectId = new Map(
        mixpanelIntegrations.map((integration) => [
          integration.projectId,
          integration,
        ]),
      );
      const blobStorageIntegrationsByProjectId = new Map(
        blobStorageIntegrations.map((integration) => [
          integration.projectId,
          integration,
        ]),
      );

      return {
        projects: projects.map((project) => {
          const legacyIntegrations = getLegacyIntegrations({
            posthogIntegration: posthogIntegrationsByProjectId.get(project.id),
            mixpanelIntegration: mixpanelIntegrationsByProjectId.get(
              project.id,
            ),
            blobStorageIntegration: blobStorageIntegrationsByProjectId.get(
              project.id,
            ),
          });

          return {
            projectId: project.id,
            projectName: project.name,
            legacyIntegrationCount:
              Object.values(legacyIntegrations).filter(Boolean).length,
            legacyIntegrations,
            forceV3Experience: isForceV3ExperienceProject(project.id),
          };
        }),
      };
    }),

  traceLevelEvalSummaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      // Only active evaluators running on new data require migration;
      // inactive or backfill-only (EXISTING) configs are not counted.
      const traceLevelEvalCounts = await ctx.prisma.jobConfiguration.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: projectIds },
          jobType: "EVAL",
          targetObject: { in: [TRACE_EVAL_TARGET, DATASET_EVAL_TARGET] },
          status: "ACTIVE",
          timeScope: { has: "NEW" },
        },
        _count: { _all: true },
      });
      const traceLevelEvalCountsByProjectId = new Map(
        traceLevelEvalCounts.map((row) => [row.projectId, row._count._all]),
      );

      return projectIds.map(
        (projectId): TraceLevelEvalSummaryByProjectResultRow => ({
          projectId,
          traceLevelEvalCount:
            traceLevelEvalCountsByProjectId.get(projectId) ?? 0,
        }),
      );
    }),

  sdkUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      const scoresUnionSql = `
  UNION ALL

  SELECT
    project_id,
    timestamp AS event_time,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key,
    false AS is_otel_ingestion,
    false AS is_delayed_otel,
    true AS is_score_ingestion
  FROM scores FINAL
  WHERE
    project_id IN {projectIds: Array(String)}
    AND timestamp >= {fromTimestamp: DateTime64(3)}
    AND timestamp <= {toTimestamp: DateTime64(3)}
    AND NOT startsWith(environment, 'langfuse-')
    AND execution_trace_id IS NULL
    AND source != 'ANNOTATION'
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0`;

      const [rows, datasetRunItemsPostUsageResult] = await Promise.all([
        queryClickhouse<SdkUsageSummaryByProjectRow>({
          query: `
WITH selected AS (
  SELECT
    project_id,
    start_time AS event_time,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key,
    (source = 'otel' OR startsWith(source, 'otel-dual-write')) AS is_otel_ingestion,
    startsWith(source, 'otel-dual-write') AS is_delayed_otel,
    false AS is_score_ingestion
  FROM events_core
  WHERE
    project_id IN {projectIds: Array(String)}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    AND NOT startsWith(environment, 'langfuse-')
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0
  ${scoresUnionSql}
)

SELECT
  project_id AS projectId,
  sdk_name AS sdkName,
  sdk_version AS sdkVersion,
  public_key AS publicKey,
  count() AS count,
  countIf(NOT is_score_ingestion) AS eventsCount,
  formatDateTime(min(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
  formatDateTime(max(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen,
  if(countIf(is_otel_ingestion) > 0, argMaxIf(is_delayed_otel, event_time, is_otel_ingestion), NULL) AS hasDelayedOtelEvents
FROM selected
GROUP BY project_id, sdk_name, sdk_version, public_key
ORDER BY project_id ASC, sdk_name ASC, sdk_version ASC, public_key ASC
          `,
          params: {
            projectIds,
            fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
            toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
            internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
          },
          tags: {
            route: "v4-org-sdk-usage-summary",
          },
          preferredClickhouseService: "EventsReadOnly",
        }),
        queryClickhouse<DatasetRunItemsPostUsageByProjectRow>({
          query: `
SELECT
  JSONExtractString(log_comment, 'projectId') AS projectId,
  count() AS count
FROM ${systemTableRef("system.query_log")}
WHERE
  event_time >= {fromTimestamp: DateTime64(3)}
  AND event_time <= {toTimestamp: DateTime64(3)}
  AND event_date >= toDate({fromTimestamp: DateTime64(3)})
  AND event_date <= toDate({toTimestamp: DateTime64(3)})
  AND type = 'QueryFinish'
  AND JSONExtractString(log_comment, 'tag_schema_version') = '1'
  AND JSONExtractString(log_comment, 'surface') = 'publicapi'
  AND JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}
  AND splitByChar('?', JSONExtractString(log_comment, 'route'))[1] = 'POST /api/public/dataset-run-items'
GROUP BY projectId
SETTINGS skip_unavailable_shards = 1
          `,
          params: {
            projectIds,
            fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
            toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
          },
          tags: {
            route: "v4-org-experiment-instrumentation-summary",
          },
          preferredClickhouseService: "EventsReadOnly",
          clickhouseSettings: {
            skip_unavailable_shards: 1,
          },
        })
          .then((rows) => ({ status: "success" as const, rows }))
          .catch((error: unknown) => {
            logger.warn(
              "Failed to query dataset-run-items POST usage for v4 migration",
              error,
            );
            return {
              status: "error" as const,
              rows: [] as DatasetRunItemsPostUsageByProjectRow[],
            };
          }),
      ]);

      const rowsByProjectId = new Map<string, SdkUsageSummaryByProjectRow[]>();
      for (const row of rows) {
        const projectRows = rowsByProjectId.get(row.projectId) ?? [];
        projectRows.push(row);
        rowsByProjectId.set(row.projectId, projectRows);
      }
      const projectsUsingDatasetRunItemsPost = new Set(
        datasetRunItemsPostUsageResult.rows
          .filter((row) => Number(row.count) > 0)
          .map((row) => row.projectId),
      );

      return projectIds.map((projectId): SdkUsageSummaryByProjectResultRow => {
        const projectRows = (rowsByProjectId.get(projectId) ?? []).map(
          (row): DecoratedSdkUsageSummaryRow & { eventsCount: number } => {
            const classification = classifyIngestionSdkVersion({
              sdkName: row.sdkName,
              sdkVersion: row.sdkVersion,
            });
            const capabilityStatus = getSdkVersionCapabilityStatus(
              { language: row.sdkName, version: row.sdkVersion },
              "appRootObservations",
            );

            return {
              sdkName: row.sdkName,
              sdkVersion: row.sdkVersion,
              publicKey: row.publicKey,
              count: Number(row.count),
              eventsCount: Number(row.eventsCount),
              firstSeen: row.firstSeen,
              lastSeen: row.lastSeen,
              hasDelayedOtelEvents: toNullableBoolean(row.hasDelayedOtelEvents),
              attributionStatus: classifyIngestionSdkAttribution({
                sdkName: row.sdkName,
                sdkVersion: row.sdkVersion,
              }),
              canonicalSdkName: classification.canonicalSdkName,
              upgradeStatus:
                capabilityStatus === "supported"
                  ? "current"
                  : capabilityStatus === "unsupported" &&
                      classification.status === "current"
                    ? "outdated_minor"
                    : classification.status,
            };
          },
        );
        const sdkUsageSeries = projectRows.map(
          (row): SdkUsageSummaryByProjectSeries => {
            return {
              sdkName: row.sdkName,
              sdkVersion: row.sdkVersion,
              canonicalSdkName: row.canonicalSdkName,
              publicKey: row.publicKey,
              count: row.count,
              eventsCount: row.eventsCount,
              firstSeen: row.firstSeen!,
              lastSeen: row.lastSeen!,
              hasDelayedOtelEvents: row.hasDelayedOtelEvents,
              attributionStatus: row.attributionStatus,
              v4MigrationStatus:
                row.upgradeStatus === "current"
                  ? "compatible"
                  : row.upgradeStatus === "outdated_minor"
                    ? "upgrade_recommended"
                    : row.upgradeStatus === "outdated_major"
                      ? "upgrade_required"
                      : "unknown",
            };
          },
        );
        const usesDatasetRunItemsPost =
          projectsUsingDatasetRunItemsPost.has(projectId);
        const langfuseSdkUsage = projectRows.filter(
          (series) => series.canonicalSdkName !== null,
        );
        const hasCurrentExperimentInstrumentation =
          langfuseSdkUsage.length > 0 &&
          langfuseSdkUsage.every(
            (series) =>
              getSdkVersionCapabilityStatus(
                {
                  language: series.sdkName,
                  version: series.sdkVersion,
                },
                "experimentLinkDeprecation",
              ) === "supported",
          );
        const hasInconclusiveExperimentSdkUsage = langfuseSdkUsage.some(
          (series) => {
            const runnerStatus = getSdkVersionCapabilityStatus(
              {
                language: series.sdkName,
                version: series.sdkVersion,
              },
              "experimentRunner",
            );
            const currentInstrumentationStatus = getSdkVersionCapabilityStatus(
              {
                language: series.sdkName,
                version: series.sdkVersion,
              },
              "experimentLinkDeprecation",
            );

            return (
              currentInstrumentationStatus === "unknown" ||
              (runnerStatus !== "unsupported" &&
                currentInstrumentationStatus !== "supported")
            );
          },
        );
        const experimentInstrumentationMigration: SdkUsageSummaryByProjectResultRow["experimentInstrumentationMigration"] =
          datasetRunItemsPostUsageResult.status === "error"
            ? { status: "check_failed", upgradePath: null }
            : !usesDatasetRunItemsPost
              ? { status: "not_required", upgradePath: null }
              : hasCurrentExperimentInstrumentation
                ? { status: "not_required", upgradePath: null }
                : hasInconclusiveExperimentSdkUsage
                  ? { status: "sdk_usage_inconclusive", upgradePath: "sdk" }
                  : { status: "required", upgradePath: "api" };

        return {
          projectId,
          experimentInstrumentationMigration,
          sdkUsageSeries,
        };
      });
    }),

  legacyApiUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      const rows = await queryClickhouse<LegacyApiUsageSummaryByProjectRow>({
        query: `
WITH selected AS (
  SELECT
    JSONExtractString(log_comment, 'projectId') AS project_id,
    splitByChar('?', JSONExtractString(log_comment, 'route'))[1] AS route_path
  FROM ${systemTableRef("system.query_log")}
  WHERE
    event_time >= {fromTimestamp: DateTime64(3)}
    AND event_time <= {toTimestamp: DateTime64(3)}
    AND event_date >= toDate({fromTimestamp: DateTime64(3)})
    AND event_date <= toDate({toTimestamp: DateTime64(3)})
    AND type = 'QueryFinish'
    AND JSONExtractString(log_comment, 'tag_schema_version') = '1'
    AND JSONExtractString(log_comment, 'surface') = 'publicapi'
    AND JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}
),
classified AS (
  SELECT
    project_id,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/sessions',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics',
        'GET /api/public/metrics/daily',
        'GET /api/public/dataset-run-items'
      ), route_path,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 'GET /api/public/traces/{id}',
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 'GET /api/public/sessions/{id}',
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 'GET /api/public/observations/{id}',
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 'GET /api/public/scores/{id}',
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 'GET /api/public/v2/scores/{id}',
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 'GET /api/public/datasets/{datasetName}/runs/{runName}',
      NULL
    ) AS legacy_route,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics/daily',
        'GET /api/public/dataset-run-items'
      ), 2,
      route_path IN (
        'GET /api/public/sessions',
        'GET /api/public/metrics'
      ), 1,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 3,
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 1,
      NULL
    ) AS clickhouse_queries_per_api_call
  FROM selected
)

SELECT
  project_id AS projectId,
  concat('publicapi: ', legacy_route) AS entrypoint,
  sum(1.0 / clickhouse_queries_per_api_call) AS count
FROM classified
WHERE legacy_route IS NOT NULL
  AND clickhouse_queries_per_api_call IS NOT NULL
GROUP BY project_id, legacy_route
ORDER BY project_id ASC, legacy_route ASC
SETTINGS skip_unavailable_shards = 1
        `,
        params: {
          projectIds,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          route: "v4-org-legacy-api-usage-summary",
        },
        preferredClickhouseService: "ReadOnly",
        clickhouseSettings: {
          skip_unavailable_shards: 1,
        },
      });

      return rows.map(
        (row): LegacyApiUsageSummaryByProjectResultRow => ({
          projectId: row.projectId,
          entrypoint: row.entrypoint,
          count: Number(row.count),
        }),
      );
    }),

  timeSeriesByEntrypoint: protectedProjectProcedure
    .input(timelineInputSchema)
    .query(async ({ input }) => {
      const granularity = resolveTimelineGranularity(
        input.fromTimestamp,
        input.toTimestamp,
      );
      const bucketTimeSql = getTimelineBucketSql(
        "event_time_microseconds",
        granularity,
      );

      const rows = await queryClickhouse<LegacyApiUsageRow>({
        query: `
WITH selected AS (
  SELECT
    ${bucketTimeSql} AS bucket_time,
    event_time_microseconds,
    splitByChar('?', JSONExtractString(log_comment, 'route'))[1] AS route_path
  FROM ${systemTableRef("system.query_log")}
  WHERE
    event_time >= {fromTimestamp: DateTime64(3)}
    AND event_time <= {toTimestamp: DateTime64(3)}
    AND event_date >= toDate({fromTimestamp: DateTime64(3)})
    AND event_date <= toDate({toTimestamp: DateTime64(3)})
    AND type = 'QueryFinish'
    AND JSONExtractString(log_comment, 'tag_schema_version') = '1'
    AND JSONExtractString(log_comment, 'surface') = 'publicapi'
    AND JSONExtractString(log_comment, 'projectId') = {projectId: String}
),
classified AS (
  SELECT
    bucket_time,
    event_time_microseconds,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/sessions',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics',
        'GET /api/public/metrics/daily',
        'GET /api/public/dataset-run-items'
      ), route_path,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 'GET /api/public/traces/{id}',
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 'GET /api/public/sessions/{id}',
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 'GET /api/public/observations/{id}',
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 'GET /api/public/scores/{id}',
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 'GET /api/public/v2/scores/{id}',
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 'GET /api/public/datasets/{datasetName}/runs/{runName}',
      NULL
    ) AS legacy_route,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics/daily',
        'GET /api/public/dataset-run-items'
      ), 2,
      route_path IN (
        'GET /api/public/sessions',
        'GET /api/public/metrics'
      ), 1,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 3,
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 1,
      NULL
    ) AS clickhouse_queries_per_api_call
  FROM selected
)

SELECT
  formatDateTime(bucket_time, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS time,
  concat('publicapi: ', legacy_route) AS entrypoint,
  sum(1.0 / clickhouse_queries_per_api_call) AS count,
  formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen
FROM classified
WHERE legacy_route IS NOT NULL
  AND clickhouse_queries_per_api_call IS NOT NULL
GROUP BY bucket_time, legacy_route
ORDER BY bucket_time ASC, legacy_route ASC
SETTINGS skip_unavailable_shards = 1
        `,
        params: {
          projectId: input.projectId,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          projectId: input.projectId,
          route: "v4-legacy-api-usage",
        },
        preferredClickhouseService: "ReadOnly",
        clickhouseSettings: {
          skip_unavailable_shards: 1,
        },
      });

      const dataRows = rows.map((row) => ({
        time: row.time,
        entrypoint: row.entrypoint,
        count: Number(row.count),
        lastSeen: row.lastSeen,
      }));

      return dataRows.length === 0
        ? dataRows
        : getEmptyTimelineBuckets(
            input.fromTimestamp,
            input.toTimestamp,
            granularity,
          )
            .concat(dataRows)
            .sort(compareTimelineRows);
    }),
});
