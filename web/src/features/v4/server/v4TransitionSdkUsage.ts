/**
 * SDK / events_core usage checks for the v4 transition.
 */
import {
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  queryClickhouse,
  type IngestionSdkAttributionStatus,
} from "@langfuse/shared/src/server";
import { getSdkVersionCapabilityStatus } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import { getDatasetRunItemsPostUsageByProject } from "@/src/features/v4/server/v4TransitionQueryLogUsage";

/** Customer-ingress sources. Historical and experiment materializations are excluded. */
const MIGRATION_INGRESS_EVENT_SOURCES = [
  "ingestion-api-dual-write",
  "otel-dual-write",
  "otel",
] as const;

type MigrationIngressSource = (typeof MIGRATION_INGRESS_EVENT_SOURCES)[number];
type MigrationIngestionPath = "otel" | "ingestion_api";
type MigrationDeliveryMode = "realtime" | "delayed";
type MigrationRemediationType =
  | "update_sdk"
  | "update_otel_instrumentation"
  | "upgrade_instrumentation";
type MigrationActionLevel = "required" | "none";
type V4MigrationStatus = "compatible" | "upgrade_required" | "unknown";

type SdkUsageSummaryByProjectRow = {
  projectId: string;
  source: MigrationIngressSource;
  ingestionPath: MigrationIngestionPath;
  deliveryMode: MigrationDeliveryMode;
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  sdkVersionMajor: string | number | null;
  latestSdkMajor: string | number | null;
  isValidSdkVersion: boolean | string | number;
  attributionStatus: IngestionSdkAttributionStatus;
  publicKey: string;
  v4MigrationStatus: V4MigrationStatus;
  remediationType: MigrationRemediationType;
  actionLevel: MigrationActionLevel;
  eventCount: string | number;
  firstSeen: string;
  lastSeen: string;
};

type SdkUsageSummaryByProjectSeries = {
  source: MigrationIngressSource;
  ingestionPath: MigrationIngestionPath;
  deliveryMode: MigrationDeliveryMode;
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  sdkVersionMajor: number | null;
  latestSdkMajor: number | null;
  isValidSdkVersion: boolean;
  attributionStatus: IngestionSdkAttributionStatus;
  publicKey: string;
  v4MigrationStatus: V4MigrationStatus;
  remediationType: MigrationRemediationType;
  actionLevel: MigrationActionLevel;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
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

const toBoolean = (value: boolean | string | number): boolean =>
  value === true || value === 1 || value === "1";

export const getSdkUsageSummaries = async ({
  projectIds,
  fromTimestamp,
  toTimestamp,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
}): Promise<SdkUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const [rows, datasetRunItemsPostUsageResult] = await Promise.all([
    queryClickhouse<SdkUsageSummaryByProjectRow>({
      query: `
WITH filtered AS (
  SELECT
    project_id AS projectId,
    source,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdkName,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdkVersion,
    ingestion_api_key AS publicKey,
    start_time
  FROM events_core
  WHERE
    project_id IN {projectIds: Array(String)}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    AND source IN {ingressSources: Array(String)}
    AND NOT startsWith(environment, 'langfuse-')
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0
),
series AS (
  SELECT
    projectId,
    source,
    sdkName,
    sdkVersion,
    publicKey,
    count() AS eventCount,
    min(start_time) AS firstSeenAt,
    max(start_time) AS lastSeenAt
  FROM filtered
  GROUP BY projectId, source, sdkName, sdkVersion, publicKey
),
classified AS (
  SELECT
    *,
    multiIf(
      lowerUTF8(trimBoth(sdkName)) IN ('python', 'langfuse-python'), 'python',
      lowerUTF8(trimBoth(sdkName)) IN (
        'javascript', 'js', 'typescript', 'ts', 'langfuse-js', 'langfuse-ts',
        '@langfuse/client', '@langfuse/browser', '@langfuse/core',
        '@langfuse/langchain', '@langfuse/otel', '@langfuse/openai',
        '@langfuse/tracing', '@langfuse/vercel-ai-sdk'
      ), 'javascript',
      NULL
    ) AS canonicalSdkName,
    match(
      lowerUTF8(sdkVersion),
      '^v?[0-9]+\\.[0-9]+\\.[0-9]+([-+].+|(a|b|rc)[0-9]+)?$'
    ) AS isValidSdkVersion,
    toUInt32OrNull(extract(lowerUTF8(sdkVersion), '^v?([0-9]+)\\.'))
      AS sdkVersionMajor,
    if(startsWith(source, 'otel'), 'otel', 'ingestion_api') AS ingestionPath,
    if(source = 'otel', 'realtime', 'delayed') AS deliveryMode,
    multiIf(
      sdkName = 'unknown' AND sdkVersion = 'unknown', 'missing_name_and_version',
      sdkName = 'unknown', 'missing_name',
      sdkVersion = 'unknown', 'missing_version',
      'attributed'
    ) AS attributionStatus
  FROM series
),
scored AS (
  SELECT
    *,
    multiIf(
      canonicalSdkName = 'python', 4,
      canonicalSdkName = 'javascript', 5,
      NULL
    ) AS latestSdkMajor,
    multiIf(
      canonicalSdkName IS NULL, 'unknown',
      NOT isValidSdkVersion OR sdkVersionMajor IS NULL, 'unknown',
      sdkVersionMajor >= latestSdkMajor, 'compatible',
      'upgrade_required'
    ) AS v4MigrationStatus,
    multiIf(
      canonicalSdkName IS NOT NULL, 'update_sdk',
      ingestionPath = 'otel', 'update_otel_instrumentation',
      'upgrade_instrumentation'
    ) AS remediationType
  FROM classified
)
SELECT
  projectId,
  source,
  ingestionPath,
  deliveryMode,
  sdkName,
  sdkVersion,
  canonicalSdkName,
  sdkVersionMajor,
  latestSdkMajor,
  isValidSdkVersion,
  attributionStatus,
  publicKey,
  v4MigrationStatus,
  remediationType,
  multiIf(
    remediationType = 'update_sdk',
      if(v4MigrationStatus = 'compatible', 'none', 'required'),
    remediationType = 'update_otel_instrumentation',
      if(deliveryMode = 'realtime', 'none', 'required'),
    'required'
  ) AS actionLevel,
  eventCount,
  formatDateTime(firstSeenAt, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
  formatDateTime(lastSeenAt, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen
FROM scored
ORDER BY
  projectId ASC,
  lastSeenAt DESC,
  source ASC,
  sdkName ASC,
  sdkVersion ASC,
  publicKey ASC
      `,
      params: {
        projectIds,
        fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
        toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
        internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
        ingressSources: [...MIGRATION_INGRESS_EVENT_SOURCES],
      },
      tags: { route: "v4-sdk-usage-summary" },
      preferredClickhouseService: "EventsReadOnly",
    }),
    getDatasetRunItemsPostUsageByProject({
      projectIds,
      fromTimestamp,
      toTimestamp,
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

  return projectIds.map((projectId) => {
    const projectRows = (rowsByProjectId.get(projectId) ?? []).map(
      (row): SdkUsageSummaryByProjectSeries => ({
        source: row.source,
        ingestionPath: row.ingestionPath,
        deliveryMode: row.deliveryMode,
        sdkName: row.sdkName,
        sdkVersion: row.sdkVersion,
        canonicalSdkName: row.canonicalSdkName,
        sdkVersionMajor:
          row.sdkVersionMajor === null ? null : Number(row.sdkVersionMajor),
        latestSdkMajor:
          row.latestSdkMajor === null ? null : Number(row.latestSdkMajor),
        isValidSdkVersion: toBoolean(row.isValidSdkVersion),
        attributionStatus: row.attributionStatus,
        publicKey: row.publicKey,
        v4MigrationStatus: row.v4MigrationStatus,
        remediationType: row.remediationType,
        actionLevel: row.actionLevel,
        eventCount: Number(row.eventCount),
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
      }),
    );
    const sdkUsageSeries = projectRows;
    const langfuseSdkUsage = projectRows.filter(
      (series) => series.canonicalSdkName !== null,
    );
    const hasCurrentExperimentInstrumentation =
      langfuseSdkUsage.length > 0 &&
      langfuseSdkUsage.every(
        (series) =>
          getSdkVersionCapabilityStatus(
            { language: series.sdkName, version: series.sdkVersion },
            "experimentLinkDeprecation",
          ) === "supported",
      );
    const hasInconclusiveExperimentSdkUsage = langfuseSdkUsage.some(
      (series) => {
        const runnerStatus = getSdkVersionCapabilityStatus(
          { language: series.sdkName, version: series.sdkVersion },
          "experimentRunner",
        );
        const currentInstrumentationStatus = getSdkVersionCapabilityStatus(
          { language: series.sdkName, version: series.sdkVersion },
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
        : !projectsUsingDatasetRunItemsPost.has(projectId)
          ? { status: "not_required", upgradePath: null }
          : hasCurrentExperimentInstrumentation
            ? { status: "not_required", upgradePath: null }
            : hasInconclusiveExperimentSdkUsage
              ? { status: "sdk_usage_inconclusive", upgradePath: "sdk" }
              : { status: "required", upgradePath: "api" };

    return { projectId, experimentInstrumentationMigration, sdkUsageSeries };
  });
};
