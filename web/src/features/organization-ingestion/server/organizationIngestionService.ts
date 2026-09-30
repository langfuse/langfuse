/**
 * Organization-level ingestion overview: raw event and score volume per
 * project and ingesting client for the trailing 7 days compared to the 7 days
 * before. Totals, change rates, statuses and grouping are left to the client.
 *
 * Event attribution mirrors the project-level v4 migration SDK breakdown
 * (same `events_core` sources and SDK columns) so both views agree.
 */
import {
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  queryClickhouse,
  UNKNOWN_INGESTION_SDK_VALUE,
  type IngestionSdkCanonicalName,
  type IngestionSdkUpgradeStatus,
} from "@langfuse/shared/src/server";
import { ScoreSourceArray, type ScoreSourceType } from "@langfuse/shared";
import { MIGRATION_INGRESS_EVENT_SOURCES } from "@/src/features/v4/server/v4TransitionCache";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const ORGANIZATION_INGESTION_WINDOW_MS = 7 * DAY_MS;

type IngestionPath = "otel" | "ingestion_api";

/** Ingesting client identity shared by event and score rows. */
type IngestionClientFields = {
  sdkName: string | null;
  sdkVersion: string | null;
  canonicalSdkName: IngestionSdkCanonicalName | null;
  sdkUpgradeStatus: IngestionSdkUpgradeStatus;
  publicKey: string | null;
  /** Written by Langfuse itself (`langfuse-*` environment or internal SDK). */
  isInternal: boolean;
  /** Count in [`window.currentFrom`, `window.to`). */
  current: number;
  /** Count in [`window.previousFrom`, `window.currentFrom`). */
  previous: number;
  /** Latest timestamp across both windows (ISO, UTC). */
  lastSeen: string;
};

type OrganizationIngestionOverview = {
  window: { previousFrom: string; currentFrom: string; to: string };
  projects: { id: string; name: string }[];
  eventRows: (IngestionClientFields & {
    projectId: string;
    ingestionPath: IngestionPath;
  })[];
  scoreRows: (IngestionClientFields & {
    projectId: string;
    source: ScoreSourceType;
  })[];
};

type ClickhouseClientRow = {
  projectId: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  isInternal: boolean | string | number;
  currentCount: string | number;
  previousCount: string | number;
  lastSeen: string;
};

const INTERNAL_CLIENT_CONDITION = `(
    startsWith(environment, 'langfuse-')
    OR ingestion_sdk_name IN {internalSdkNames: Array(String)}
  )`;

const EVENT_ROWS_QUERY = `
SELECT
  project_id AS projectId,
  if(startsWith(source, 'otel'), 'otel', 'ingestion_api') AS ingestionPath,
  ingestion_sdk_name AS sdkName,
  ingestion_sdk_version AS sdkVersion,
  ingestion_api_key AS publicKey,
  ${INTERNAL_CLIENT_CONDITION} AS isInternal,
  countIf(start_time >= {currentFrom: DateTime64(3)}) AS currentCount,
  countIf(start_time < {currentFrom: DateTime64(3)}) AS previousCount,
  formatDateTime(max(start_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen
FROM events_core
WHERE
  project_id IN {projectIds: Array(String)}
  AND start_time >= {previousFrom: DateTime64(3)}
  AND start_time < {to: DateTime64(3)}
  AND source IN {ingressSources: Array(String)}
  AND is_deleted = 0
GROUP BY projectId, ingestionPath, sdkName, sdkVersion, publicKey, isInternal
`;

const SCORE_ROWS_QUERY = `
SELECT
  project_id AS projectId,
  source,
  ingestion_sdk_name AS sdkName,
  ingestion_sdk_version AS sdkVersion,
  ingestion_api_key AS publicKey,
  ${INTERNAL_CLIENT_CONDITION} AS isInternal,
  countIf(timestamp >= {currentFrom: DateTime64(3)}) AS currentCount,
  countIf(timestamp < {currentFrom: DateTime64(3)}) AS previousCount,
  formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen
FROM scores
WHERE
  project_id IN {projectIds: Array(String)}
  AND timestamp >= {previousFrom: DateTime64(3)}
  AND timestamp < {to: DateTime64(3)}
  AND is_deleted = 0
GROUP BY projectId, source, sdkName, sdkVersion, publicKey, isInternal
`;

const toNullableSdkValue = (value: string): string | null =>
  value === "" || value === UNKNOWN_INGESTION_SDK_VALUE ? null : value;

const toClientFields = (row: ClickhouseClientRow): IngestionClientFields => {
  const sdkName = toNullableSdkValue(row.sdkName);
  const sdkVersion = toNullableSdkValue(row.sdkVersion);
  const classification = classifyIngestionSdkVersion({ sdkName, sdkVersion });
  return {
    sdkName,
    sdkVersion,
    canonicalSdkName: classification.canonicalSdkName,
    sdkUpgradeStatus: classification.status,
    publicKey: row.publicKey === "" ? null : row.publicKey,
    isInternal:
      row.isInternal === true || row.isInternal === 1 || row.isInternal === "1",
    current: Number(row.currentCount),
    previous: Number(row.previousCount),
    lastSeen: row.lastSeen,
  };
};

const isScoreSource = (value: string): value is ScoreSourceType =>
  (ScoreSourceArray as readonly string[]).includes(value);

export const getOrganizationIngestionOverview = async ({
  projects,
  nowMs = Date.now(),
}: {
  projects: { id: string; name: string }[];
  nowMs?: number;
}): Promise<OrganizationIngestionOverview> => {
  const to = new Date(Math.floor(nowMs / MINUTE_MS) * MINUTE_MS);
  const currentFrom = new Date(to.getTime() - ORGANIZATION_INGESTION_WINDOW_MS);
  const previousFrom = new Date(
    currentFrom.getTime() - ORGANIZATION_INGESTION_WINDOW_MS,
  );
  const window = {
    previousFrom: previousFrom.toISOString(),
    currentFrom: currentFrom.toISOString(),
    to: to.toISOString(),
  };

  if (projects.length === 0) {
    return { window, projects, eventRows: [], scoreRows: [] };
  }

  const params = {
    projectIds: projects.map((project) => project.id),
    previousFrom: convertDateToClickhouseDateTime(previousFrom),
    currentFrom: convertDateToClickhouseDateTime(currentFrom),
    to: convertDateToClickhouseDateTime(to),
    internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
  };

  const [eventRows, scoreRows] = await Promise.all([
    queryClickhouse<ClickhouseClientRow & { ingestionPath: IngestionPath }>({
      query: EVENT_ROWS_QUERY,
      params: {
        ...params,
        ingressSources: [...MIGRATION_INGRESS_EVENT_SOURCES],
      },
      tags: { route: "organization-ingestion-overview-events" },
      preferredClickhouseService: "EventsReadOnly",
    }),
    queryClickhouse<ClickhouseClientRow & { source: string }>({
      query: SCORE_ROWS_QUERY,
      params,
      tags: { route: "organization-ingestion-overview-scores" },
      preferredClickhouseService: "ReadOnly",
    }),
  ]);

  return {
    window,
    projects,
    eventRows: eventRows.map((row) => ({
      projectId: row.projectId,
      ingestionPath: row.ingestionPath,
      ...toClientFields(row),
    })),
    scoreRows: scoreRows.flatMap((row) =>
      isScoreSource(row.source)
        ? [
            {
              projectId: row.projectId,
              source: row.source,
              ...toClientFields(row),
            },
          ]
        : [],
    ),
  };
};
