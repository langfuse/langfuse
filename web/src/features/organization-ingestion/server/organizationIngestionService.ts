/**
 * Organization-level ingestion overview: which clients (Langfuse SDK
 * versions, custom OpenTelemetry, custom API callers) send data into each
 * project, with event and score volume for the trailing 7 days compared to
 * the 7 days before.
 *
 * Event attribution mirrors the project-level v4 migration SDK breakdown
 * (same `events_core` sources and SDK columns) so both views agree.
 */
import {
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  queryClickhouse,
  type IngestionSdkCanonicalName,
  type IngestionSdkUpgradeStatus,
} from "@langfuse/shared/src/server";
import { ScoreSourceArray, type ScoreSourceType } from "@langfuse/shared";
import { MIGRATION_INGRESS_EVENT_SOURCES } from "@/src/features/v4/server/v4TransitionCache";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const ORGANIZATION_INGESTION_WINDOW_MS = 7 * DAY_MS;

type IngestionPath = "otel" | "ingestion_api";

type IngestionClientType =
  | "langfuse_sdk"
  | "custom_otel"
  | "custom_ingestion_api"
  | "langfuse_internal";

/** `new`/`stopped` compare the current window against the previous one. */
type IngestionActivityStatus = "new" | "stopped" | "active" | "idle";

type WeekOverWeekCount = {
  current: number;
  previous: number;
  /**
   * Percent change of `current` vs `previous` (e.g. 25 = +25%). `null` when
   * the previous window is empty but the current one is not.
   */
  changePct: number | null;
};

type IngestionClient = {
  clientType: IngestionClientType;
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: IngestionSdkCanonicalName | null;
  sdkUpgradeStatus: IngestionSdkUpgradeStatus;
  ingestionPaths: IngestionPath[];
  /** Public key the client authenticated with; `null` when not recorded. */
  publicKey: string | null;
  status: IngestionActivityStatus;
  events: WeekOverWeekCount;
  /** Scores this client sent through the API (`source = API`). */
  scores: WeekOverWeekCount;
  /** Latest event or score timestamp across both windows (ISO, UTC). */
  lastSeen: string | null;
};

type ProjectIngestionFlow = {
  projectId: string;
  projectName: string;
  status: IngestionActivityStatus;
  events: WeekOverWeekCount;
  scores: WeekOverWeekCount & {
    bySource: Record<ScoreSourceType, WeekOverWeekCount>;
  };
  lastSeen: string | null;
  clients: IngestionClient[];
};

type OrganizationIngestionOverview = {
  windows: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  totals: {
    events: WeekOverWeekCount;
    scores: WeekOverWeekCount;
    projectsByStatus: Record<IngestionActivityStatus, number>;
  };
  projects: ProjectIngestionFlow[];
};

type ClickhouseBoolean = boolean | string | number;
type ClickhouseCount = string | number;

type EventFlowRow = {
  projectId: string;
  ingestionPath: IngestionPath;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  isInternal: ClickhouseBoolean;
  currentCount: ClickhouseCount;
  previousCount: ClickhouseCount;
  lastSeen: string;
};

type ScoreFlowRow = {
  projectId: string;
  scoreSource: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  isInternal: ClickhouseBoolean;
  currentCount: ClickhouseCount;
  previousCount: ClickhouseCount;
  lastSeen: string;
};

const INTERNAL_CLIENT_CONDITION = `(
    startsWith(environment, 'langfuse-')
    OR ingestion_sdk_name IN {internalSdkNames: Array(String)}
  )`;

const EVENT_FLOWS_QUERY = `
SELECT
  project_id AS projectId,
  if(startsWith(source, 'otel'), 'otel', 'ingestion_api') AS ingestionPath,
  if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdkName,
  if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdkVersion,
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

const SCORE_FLOWS_QUERY = `
SELECT
  project_id AS projectId,
  source AS scoreSource,
  if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdkName,
  if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdkVersion,
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
GROUP BY projectId, scoreSource, sdkName, sdkVersion, publicKey, isInternal
`;

const toBoolean = (value: ClickhouseBoolean): boolean =>
  value === true || value === 1 || value === "1";

const toChangePct = (current: number, previous: number): number | null => {
  if (previous !== 0) return ((current - previous) / previous) * 100;
  return current === 0 ? 0 : null;
};

const toWeekOverWeekCount = (
  current: number,
  previous: number,
): WeekOverWeekCount => ({
  current,
  previous,
  changePct: toChangePct(current, previous),
});

const emptyCount = (): WeekOverWeekCount => toWeekOverWeekCount(0, 0);

const addCounts = (
  left: WeekOverWeekCount,
  current: number,
  previous: number,
): WeekOverWeekCount =>
  toWeekOverWeekCount(left.current + current, left.previous + previous);

const toActivityStatus = (
  ...counts: WeekOverWeekCount[]
): IngestionActivityStatus => {
  const current = counts.reduce((sum, count) => sum + count.current, 0);
  const previous = counts.reduce((sum, count) => sum + count.previous, 0);
  if (current > 0 && previous === 0) return "new";
  if (current === 0 && previous > 0) return "stopped";
  if (current > 0) return "active";
  return "idle";
};

const maxTimestamp = (
  left: string | null,
  right: string | null,
): string | null => {
  if (left === null) return right;
  if (right === null) return left;
  return left > right ? left : right;
};

const deriveClientType = ({
  isInternal,
  canonicalSdkName,
  ingestionPaths,
}: {
  isInternal: boolean;
  canonicalSdkName: IngestionSdkCanonicalName | null;
  ingestionPaths: Set<IngestionPath>;
}): IngestionClientType => {
  if (isInternal) return "langfuse_internal";
  if (canonicalSdkName !== null) return "langfuse_sdk";
  if (ingestionPaths.has("otel")) return "custom_otel";
  return "custom_ingestion_api";
};

type ClientAccumulator = {
  isInternal: boolean;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  ingestionPaths: Set<IngestionPath>;
  events: WeekOverWeekCount;
  scores: WeekOverWeekCount;
  lastSeen: string | null;
};

type ProjectAccumulator = {
  events: WeekOverWeekCount;
  scores: WeekOverWeekCount;
  scoresBySource: Record<ScoreSourceType, WeekOverWeekCount>;
  lastSeen: string | null;
  clients: Map<string, ClientAccumulator>;
};

const createProjectAccumulator = (): ProjectAccumulator => ({
  events: emptyCount(),
  scores: emptyCount(),
  scoresBySource: Object.fromEntries(
    ScoreSourceArray.map((source) => [source, emptyCount()]),
  ) as Record<ScoreSourceType, WeekOverWeekCount>,
  lastSeen: null,
  clients: new Map(),
});

const getOrCreateClient = (
  project: ProjectAccumulator,
  row: Pick<
    EventFlowRow,
    "sdkName" | "sdkVersion" | "publicKey" | "isInternal"
  >,
): ClientAccumulator => {
  const isInternal = toBoolean(row.isInternal);
  const key = [
    isInternal ? "1" : "0",
    row.sdkName,
    row.sdkVersion,
    row.publicKey,
  ].join("\u0000");
  const existing = project.clients.get(key);
  if (existing) return existing;
  const client: ClientAccumulator = {
    isInternal,
    sdkName: row.sdkName,
    sdkVersion: row.sdkVersion,
    publicKey: row.publicKey,
    ingestionPaths: new Set(),
    events: emptyCount(),
    scores: emptyCount(),
    lastSeen: null,
  };
  project.clients.set(key, client);
  return client;
};

const toIngestionClient = (client: ClientAccumulator): IngestionClient => {
  const classification = classifyIngestionSdkVersion({
    sdkName: client.sdkName,
    sdkVersion: client.sdkVersion,
  });
  return {
    clientType: deriveClientType({
      isInternal: client.isInternal,
      canonicalSdkName: classification.canonicalSdkName,
      ingestionPaths: client.ingestionPaths,
    }),
    sdkName: client.sdkName,
    sdkVersion: client.sdkVersion,
    canonicalSdkName: classification.canonicalSdkName,
    sdkUpgradeStatus: classification.status,
    ingestionPaths: [...client.ingestionPaths].sort(),
    publicKey: client.publicKey === "" ? null : client.publicKey,
    status: toActivityStatus(client.events, client.scores),
    events: client.events,
    scores: client.scores,
    lastSeen: client.lastSeen,
  };
};

const compareByVolume = (
  left: { events: WeekOverWeekCount; scores: WeekOverWeekCount },
  right: { events: WeekOverWeekCount; scores: WeekOverWeekCount },
): number =>
  right.events.current - left.events.current ||
  right.scores.current - left.scores.current ||
  right.events.previous - left.events.previous ||
  right.scores.previous - left.scores.previous;

const getOrganizationIngestionWindows = (nowMs: number) => {
  const to = new Date(Math.floor(nowMs / MINUTE_MS) * MINUTE_MS);
  const currentFrom = new Date(to.getTime() - ORGANIZATION_INGESTION_WINDOW_MS);
  const previousFrom = new Date(
    currentFrom.getTime() - ORGANIZATION_INGESTION_WINDOW_MS,
  );
  return { to, currentFrom, previousFrom };
};

export const getOrganizationIngestionOverview = async ({
  projects,
  nowMs = Date.now(),
}: {
  projects: { id: string; name: string }[];
  nowMs?: number;
}): Promise<OrganizationIngestionOverview> => {
  const { to, currentFrom, previousFrom } =
    getOrganizationIngestionWindows(nowMs);
  const projectIds = projects.map((project) => project.id);

  const params = {
    projectIds,
    previousFrom: convertDateToClickhouseDateTime(previousFrom),
    currentFrom: convertDateToClickhouseDateTime(currentFrom),
    to: convertDateToClickhouseDateTime(to),
    internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
  };

  const [eventRows, scoreRows] =
    projectIds.length === 0
      ? [[] as EventFlowRow[], [] as ScoreFlowRow[]]
      : await Promise.all([
          queryClickhouse<EventFlowRow>({
            query: EVENT_FLOWS_QUERY,
            params: {
              ...params,
              ingressSources: [...MIGRATION_INGRESS_EVENT_SOURCES],
            },
            tags: { route: "organization-ingestion-overview-events" },
            preferredClickhouseService: "EventsReadOnly",
          }),
          queryClickhouse<ScoreFlowRow>({
            query: SCORE_FLOWS_QUERY,
            params,
            tags: { route: "organization-ingestion-overview-scores" },
            preferredClickhouseService: "ReadOnly",
          }),
        ]);

  const accumulators = new Map(
    projectIds.map((projectId) => [projectId, createProjectAccumulator()]),
  );

  for (const row of eventRows) {
    const project = accumulators.get(row.projectId);
    if (!project) continue;
    const current = Number(row.currentCount);
    const previous = Number(row.previousCount);
    project.events = addCounts(project.events, current, previous);
    project.lastSeen = maxTimestamp(project.lastSeen, row.lastSeen);

    const client = getOrCreateClient(project, row);
    client.ingestionPaths.add(row.ingestionPath);
    client.events = addCounts(client.events, current, previous);
    client.lastSeen = maxTimestamp(client.lastSeen, row.lastSeen);
  }

  for (const row of scoreRows) {
    const project = accumulators.get(row.projectId);
    if (!project) continue;
    const current = Number(row.currentCount);
    const previous = Number(row.previousCount);
    project.scores = addCounts(project.scores, current, previous);
    project.lastSeen = maxTimestamp(project.lastSeen, row.lastSeen);

    const scoreSource = ScoreSourceArray.find(
      (source) => source === row.scoreSource,
    );
    if (scoreSource) {
      project.scoresBySource[scoreSource] = addCounts(
        project.scoresBySource[scoreSource],
        current,
        previous,
      );
    }

    // Annotation and eval scores are produced by Langfuse itself, not by an
    // ingesting client, so only API scores are attributed to a client.
    if (scoreSource !== "API") continue;
    const client = getOrCreateClient(project, row);
    client.ingestionPaths.add("ingestion_api");
    client.scores = addCounts(client.scores, current, previous);
    client.lastSeen = maxTimestamp(client.lastSeen, row.lastSeen);
  }

  const projectFlows: ProjectIngestionFlow[] = projects
    .map((project) => {
      const accumulator = accumulators.get(project.id)!;
      return {
        projectId: project.id,
        projectName: project.name,
        status: toActivityStatus(accumulator.events, accumulator.scores),
        events: accumulator.events,
        scores: { ...accumulator.scores, bySource: accumulator.scoresBySource },
        lastSeen: accumulator.lastSeen,
        clients: [...accumulator.clients.values()]
          .map(toIngestionClient)
          .sort(compareByVolume),
      };
    })
    .sort(
      (left, right) =>
        compareByVolume(left, right) ||
        left.projectName.localeCompare(right.projectName),
    );

  const projectsByStatus: Record<IngestionActivityStatus, number> = {
    new: 0,
    stopped: 0,
    active: 0,
    idle: 0,
  };
  let totalEvents = emptyCount();
  let totalScores = emptyCount();
  for (const project of projectFlows) {
    projectsByStatus[project.status] += 1;
    totalEvents = addCounts(
      totalEvents,
      project.events.current,
      project.events.previous,
    );
    totalScores = addCounts(
      totalScores,
      project.scores.current,
      project.scores.previous,
    );
  }

  return {
    windows: {
      current: { from: currentFrom.toISOString(), to: to.toISOString() },
      previous: {
        from: previousFrom.toISOString(),
        to: currentFrom.toISOString(),
      },
    },
    totals: {
      events: totalEvents,
      scores: totalScores,
      projectsByStatus,
    },
    projects: projectFlows,
  };
};
