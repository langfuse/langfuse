import {
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  queryClickhouse,
  UNKNOWN_INGESTION_SDK_VALUE,
  type IngestionSdkCanonicalName,
  type IngestionSdkUpgradeStatus,
} from "@langfuse/shared/src/server";
import { type ScoreSourceType } from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
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

/** Current configuration counts, not scoped to the ingestion windows. */
type ProjectFeatureCounts = {
  activeEvaluationRules: number;
  datasets: number;
  /** Latest, non-deleted dataset item versions. */
  datasetItems: number;
  activeMonitors: number;
  /** Distinct prompt names, not versions. */
  prompts: number;
};

type OrganizationIngestionOverview = {
  window: { previousFrom: string; currentFrom: string; to: string };
  projects: { id: string; name: string; features: ProjectFeatureCounts }[];
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

const EVENT_ROWS_QUERY = `
SELECT
  project_id AS projectId,
  if(startsWith(source, 'otel'), 'otel', 'ingestion_api') AS ingestionPath,
  ingestion_sdk_name AS sdkName,
  ingestion_sdk_version AS sdkVersion,
  ingestion_api_key AS publicKey,
  startsWith(environment, 'langfuse-') AS isInternal,
  countIf(start_time >= {currentFrom: DateTime64(3)}) AS currentCount,
  countIf(start_time < {currentFrom: DateTime64(3)}) AS previousCount,
  formatDateTime(max(start_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen
FROM events_core
WHERE
  project_id IN {projectIds: Array(String)}
  AND start_time >= {previousFrom: DateTime64(3)}
  AND start_time < {to: DateTime64(3)}
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
  startsWith(environment, 'langfuse-') AS isInternal,
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

const getProjectFeatureCounts = async ({
  prisma,
  projectIds,
}: {
  prisma: PrismaClient;
  projectIds: string[];
}): Promise<Map<string, ProjectFeatureCounts>> => {
  const [evaluationRules, datasets, datasetItems, monitors, prompts] =
    await Promise.all([
      prisma.evaluationRule.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, status: "ACTIVE" },
        _count: { _all: true },
      }),
      prisma.dataset.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      prisma.datasetItem.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: projectIds },
          isDeleted: false,
          validTo: null,
        },
        _count: { _all: true },
      }),
      prisma.monitor.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, status: "ACTIVE" },
        _count: { _all: true },
      }),
      prisma.$queryRaw<{ projectId: string; count: bigint }[]>(Prisma.sql`
        SELECT project_id AS "projectId", COUNT(DISTINCT name) AS count
        FROM prompts
        WHERE project_id IN (${Prisma.join(projectIds)})
        GROUP BY project_id
      `),
    ]);

  const toCountMap = (
    rows: { projectId: string; _count: { _all: number } }[],
  ) => new Map(rows.map((row) => [row.projectId, row._count._all]));
  const evaluationRuleCounts = toCountMap(evaluationRules);
  const datasetCounts = toCountMap(datasets);
  const datasetItemCounts = toCountMap(datasetItems);
  const monitorCounts = toCountMap(monitors);
  const promptCounts = new Map(
    prompts.map((row) => [row.projectId, Number(row.count)]),
  );

  return new Map(
    projectIds.map((projectId) => [
      projectId,
      {
        activeEvaluationRules: evaluationRuleCounts.get(projectId) ?? 0,
        datasets: datasetCounts.get(projectId) ?? 0,
        datasetItems: datasetItemCounts.get(projectId) ?? 0,
        activeMonitors: monitorCounts.get(projectId) ?? 0,
        prompts: promptCounts.get(projectId) ?? 0,
      },
    ]),
  );
};

export const getOrganizationIngestionOverview = async ({
  prisma,
  projects,
  nowMs = Date.now(),
}: {
  prisma: PrismaClient;
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
    return { window, projects: [], eventRows: [], scoreRows: [] };
  }

  const params = {
    projectIds: projects.map((project) => project.id),
    previousFrom: convertDateToClickhouseDateTime(previousFrom),
    currentFrom: convertDateToClickhouseDateTime(currentFrom),
    to: convertDateToClickhouseDateTime(to),
  };

  const [featureCounts, eventRows, scoreRows] = await Promise.all([
    getProjectFeatureCounts({ prisma, projectIds: params.projectIds }),
    queryClickhouse<ClickhouseClientRow & { ingestionPath: IngestionPath }>({
      query: EVENT_ROWS_QUERY,
      params,
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
    projects: projects.map((project) => ({
      ...project,
      features: featureCounts.get(project.id)!,
    })),
    eventRows: eventRows.map((row) => ({
      projectId: row.projectId,
      ingestionPath: row.ingestionPath,
      ...toClientFields(row),
    })),
    scoreRows: scoreRows.flatMap((row) => [
      {
        projectId: row.projectId,
        source: row.source as ScoreSourceType,
        ...toClientFields(row),
      },
    ]),
  };
};
