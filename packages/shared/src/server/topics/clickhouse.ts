import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import { buildClickHouseLogComment } from "../clickhouse/queryTags";
import { OBSERVATIONS_TO_TRACE_INTERVAL_DAYS } from "../repositories/constants";
import { env } from "../../env";
import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
} from "../repositories/clickhouse";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicSummary,
  TopicTimeRange,
} from "../../topics";
import { topicSourceSchema, topicTimeRangeSchema } from "../../topics";
import { Decimal } from "decimal.js";
import { logger } from "../logger";
import { traceException } from "../instrumentation";
import { redis } from "../redis/redis";
import { chunk } from "lodash";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  isInternalEvalEnvironment,
  PUBLIC_INTERNAL_EVAL_ENVIRONMENTS,
} from "../llm/isInternalEvalEnvironment";

const sourceKeySql =
  "project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')";

export const unitTimeFilterSql =
  "unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}";

const summaryVersionKeySql =
  "facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, created_at";
export const summarySourceKeySql =
  "facet_id, trace_id, if(trace_id = '', session_id, '')";

// Each unit's latest version, also from rows that moved up to 2 days outside the window.
// State, model and dimension filters apply after this check.
export function latestSummaryFilterSql(
  scopeSql: string,
  latestKeySql = sourceKeySql,
) {
  return `(${summaryVersionKeySql}) IN (
    SELECT ${summaryVersionKeySql} FROM topic_facet_summaries
    WHERE project_id = {projectId:String}
      AND unit_start_time >= {from:DateTime64(3)} - INTERVAL 2 DAY
      AND unit_start_time < {to:DateTime64(3)} + INTERVAL 2 DAY
      AND (${summarySourceKeySql}) IN (
        SELECT ${summarySourceKeySql} FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
        GROUP BY ${summarySourceKeySql}
      )
    ORDER BY facet_version DESC, created_at DESC
    LIMIT 1 BY ${latestKeySql}
  )`;
}

export function timeRangeParams(timeRange: TopicTimeRange) {
  const { from, to } = topicTimeRangeSchema.parse(timeRange);
  return {
    from: convertDateToClickhouseDateTime(from),
    to: convertDateToClickhouseDateTime(to),
  };
}

/** Summaries start at a trace's first observation; later observations can follow within this window. */
export const TRACE_START_SLACK_MS =
  OBSERVATIONS_TO_TRACE_INTERVAL_DAYS * 86_400_000;

const LOOKUP_BATCH_SIZE = 1000;
const INSERT_BATCH_SIZE = 10_000;
const INSERT_BATCH_BYTES = 8 * 1024 * 1024;

const sourceFilterSql =
  "(trace_id, if(trace_id = '', session_id, '')) IN arrayZip({traceIds:Array(String)}, {sessionIds:Array(String)})";

function sourceBatches(sources: Pick<TopicSummary, "traceId" | "sessionId">[]) {
  const keys = new Map<string, { traceId: string; sessionId: string }>();
  for (const value of sources) {
    const source = topicSourceSchema.parse(value);
    const traceId = source.traceId ?? "";
    const sessionId = source.traceId === null ? source.sessionId : "";
    keys.set(JSON.stringify([traceId, sessionId]), { traceId, sessionId });
  }
  return chunk([...keys.values()], LOOKUP_BATCH_SIZE).map((batch) => ({
    traceIds: batch.map((source) => source.traceId),
    sessionIds: batch.map((source) => source.sessionId),
  }));
}

async function insertTopicRows<T extends { projectId: string }>(
  table: "topic_facet_summaries" | "topic_assignments",
  rows: T[],
  serialize: (row: T) => Record<string, unknown>,
): Promise<void> {
  let values: Record<string, unknown>[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!values.length) return;
    await clickhouseClient().insert({
      table,
      format: "JSONEachRow",
      values,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
        log_comment: buildClickHouseLogComment({
          surface: "worker",
          route: {
            topic_facet_summaries: "topics-summaries",
            topic_assignments: "topics-assignments",
          }[table],
          projectId: rows[0].projectId,
        }),
      },
    });
    values = [];
    bytes = 0;
  };
  for (const row of rows) {
    const value = serialize(row);
    const size = Buffer.byteLength(JSON.stringify(value), "utf8") + 1;
    if (size > INSERT_BATCH_BYTES)
      throw new Error("A Topics result exceeds the maximum insert row size.");
    if (values.length >= INSERT_BATCH_SIZE || bytes + size > INSERT_BATCH_BYTES)
      await flush();
    values.push(value);
    bytes += size;
  }
  await flush();
}

const numberMap = (values: Record<string, number | string>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Number(value)]),
  );

export async function getTopicDefinitions(
  projectId: string,
  topicVersionIds: string[],
  timeRange: TopicTimeRange,
): Promise<TopicDefinition[]> {
  const definitions: TopicDefinition[] = [];
  for (const ids of chunk([...new Set(topicVersionIds)], LOOKUP_BATCH_SIZE)) {
    const rows = await queryClickhouse<
      Omit<
        TopicDefinition,
        "createdAt" | "metadata" | "representativeSummaries" | "costDetails"
      > & {
        createdAtMs: string;
        metadataJson: string;
        costDetails: Record<string, string | number>;
        representativeSummaries: {
          facet_id: string;
          facet_version: number;
          trace_id: string;
          session_id: string;
        }[];
      }
    >({
      query: `SELECT project_id AS projectId, id AS topicVersionId,
        stable_id AS topicId, created_by_run_id AS createdByRunId,
        toUnixTimestamp64Milli(created_at) AS createdAtMs, name, description,
        centroid, radius, labels, representative_summaries AS representativeSummaries,
        metadata AS metadataJson, cost_details AS costDetails
        FROM topics
        WHERE project_id = {projectId:String} AND id IN {ids:Array(String)}
          AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
        ORDER BY created_at DESC LIMIT 1 BY project_id, id`,
      params: { projectId, ids, ...timeRangeParams(timeRange) },
      tags: { route: "topics-definitions", projectId },
    });
    definitions.push(
      ...rows.map(({ createdAtMs, metadataJson, costDetails, ...row }) => ({
        ...row,
        ...(Object.keys(costDetails).length > 0 && {
          costDetails: numberMap(costDetails),
        }),
        createdAt: new Date(Number(createdAtMs)).toISOString(),
        representativeSummaries: row.representativeSummaries.map((source) => ({
          facetId: source.facet_id,
          facetVersion: source.facet_version,
          traceId: source.trace_id || null,
          sessionId: source.session_id || null,
        })),
        metadata: JSON.parse(metadataJson) as Record<string, unknown>,
      })),
    );
  }
  return definitions;
}

/** Names and ids of topic versions, without geometry or representative summaries. */
export async function getTopicNames(
  projectId: string,
  topicVersionIds: string[],
  timeRange: TopicTimeRange,
) {
  const names: { topicVersionId: string; topicId: string; name: string }[] = [];
  for (const ids of chunk([...new Set(topicVersionIds)], LOOKUP_BATCH_SIZE))
    names.push(
      ...(await queryClickhouse<(typeof names)[number]>({
        query: `SELECT id AS topicVersionId, stable_id AS topicId, name
          FROM topics
          WHERE project_id = {projectId:String} AND id IN {ids:Array(String)}
            AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
          ORDER BY created_at DESC LIMIT 1 BY project_id, id`,
        params: { projectId, ids, ...timeRangeParams(timeRange) },
        tags: { route: "topics-names", projectId },
      })),
    );
  return names;
}

/** Keep prices representable by ClickHouse Decimal(18,12) at its stored precision. */
export function normalizeTopicDefinitionCosts(
  details: TopicDefinition["costDetails"],
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(details ?? {})
      .filter(
        ([, cost]) => Number.isFinite(cost) && cost >= 0 && cost < 1_000_000,
      )
      .map(([key, cost]) => [
        key,
        new Decimal(cost).toDecimalPlaces(12).toNumber(),
      ]),
  );
}

/** RowBinary column order matches the explicit definition INSERT below. */
function encodeTopicDefinition(row: TopicDefinition): Buffer {
  const parts: Buffer[] = [];
  const length = (value: number) => {
    const bytes: number[] = [];
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      bytes.push(byte + (value ? 128 : 0));
    } while (value);
    parts.push(Buffer.from(bytes));
  };
  const string = (value: string) => {
    const bytes = Buffer.from(value, "utf8");
    length(bytes.length);
    parts.push(bytes);
  };
  const strings = (values: string[]) => {
    length(values.length);
    for (const value of values) string(value);
  };

  string(row.projectId);
  string(row.topicVersionId);
  string(row.topicId);
  string(row.createdByRunId);
  const createdAt = Buffer.allocUnsafe(8);
  createdAt.writeBigInt64LE(BigInt(Date.parse(row.createdAt)));
  parts.push(createdAt);
  string(row.name);
  string(row.description);
  length(row.centroid.length);
  const centroid = Buffer.allocUnsafe(row.centroid.length * 8);
  for (let index = 0; index < row.centroid.length; index++)
    centroid.writeDoubleLE(row.centroid[index], index * 8);
  parts.push(centroid);
  const radius = Buffer.allocUnsafe(8);
  radius.writeDoubleLE(row.radius);
  parts.push(radius);
  strings(row.labels);
  length(row.representativeSummaries.length);
  for (const source of row.representativeSummaries) {
    string(source.facetId);
    const facetVersion = Buffer.allocUnsafe(4);
    facetVersion.writeUInt32LE(source.facetVersion);
    parts.push(facetVersion);
    string(source.traceId ?? "");
    string(source.traceId === null ? source.sessionId! : "");
  }
  string(JSON.stringify(row.metadata));
  const costs = Object.entries(normalizeTopicDefinitionCosts(row.costDetails));
  length(costs.length);
  for (const [key, cost] of costs) {
    string(key);
    const scaled = Buffer.allocUnsafe(8);
    scaled.writeBigInt64LE(BigInt(new Decimal(cost).mul(1e12).toFixed(0)));
    parts.push(scaled);
  }
  return Buffer.concat(parts);
}

export async function writeTopicDefinitions(
  rows: TopicDefinition[],
): Promise<void> {
  for (const row of rows) {
    if (
      !row.projectId ||
      !row.topicVersionId ||
      !row.topicId ||
      !row.createdByRunId ||
      !Number.isFinite(Date.parse(row.createdAt)) ||
      !row.centroid.length ||
      !Number.isFinite(row.radius) ||
      row.radius < 0
    )
      throw new Error("Invalid topic definition.");
    for (const value of row.centroid)
      if (!Number.isFinite(value)) throw new Error("Invalid topic definition.");
  }
  let values: Buffer[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!values.length) return;
    const result = await clickhouseClient().exec({
      query: `INSERT INTO topics (project_id, id, stable_id, created_by_run_id,
        created_at, name, description, centroid, radius, labels,
        representative_summaries, metadata, cost_details) FORMAT RowBinary`,
      values: Readable.from(values),
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
        log_comment: buildClickHouseLogComment({
          surface: "worker",
          route: "topics-definitions",
          projectId: rows[0].projectId,
        }),
      },
    });
    await finished(result.stream.resume(), { cleanup: true });
    values = [];
    bytes = 0;
  };
  for (const row of rows) {
    const value = encodeTopicDefinition(row);
    if (value.length > INSERT_BATCH_BYTES)
      throw new Error("A Topics result exceeds the maximum insert row size.");
    if (
      values.length >= INSERT_BATCH_SIZE ||
      bytes + value.length > INSERT_BATCH_BYTES
    )
      await flush();
    values.push(value);
    bytes += value.length;
  }
  await flush();
}

const summaryColumns = `project_id AS projectId, facet_id AS facetId,
  facet_version AS facetVersion,
  trace_id AS traceId, session_id AS sessionId, trigger_type AS triggerType,
  rule_ids AS ruleIds, execution_id AS executionId, environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
  processing_state AS state, summary, embedding,
  transcript_id AS transcriptId, transcript_version AS transcriptVersion, transcript_bytes AS transcriptBytes,
  summary_model AS summaryModel, embedding_model AS embeddingModel,
  provided_usage_details AS providedUsageDetails, usage_details AS usageDetails,
  provided_cost_details AS providedCostDetails, cost_details AS costDetails,
  toUnixTimestamp64Milli(created_at) AS createdAtMs, metadata AS metadataJson`;

type SummaryRow = Omit<
  TopicSummary,
  "metadata" | "unitStartTime" | "createdAt" | "executionId"
> & {
  metadataJson: string;
  unitStartTimeMs: string;
  createdAtMs: string;
  executionId: string;
};
function summarySourceAndTimestamps(
  row: Pick<
    SummaryRow,
    "traceId" | "sessionId" | "unitStartTimeMs" | "createdAtMs"
  >,
) {
  return {
    ...topicSourceSchema.parse({
      traceId: row.traceId || null,
      sessionId: row.sessionId || null,
    }),
    unitStartTime: new Date(Number(row.unitStartTimeMs)).toISOString(),
    createdAt: new Date(Number(row.createdAtMs)).toISOString(),
  };
}

function summaryResult(row: SummaryRow): TopicSummary {
  const { metadataJson, unitStartTimeMs, createdAtMs, ...rest } = row;
  return {
    ...rest,
    ...summarySourceAndTimestamps(row),
    executionId: row.executionId || null,
    providedUsageDetails: numberMap(row.providedUsageDetails),
    usageDetails: numberMap(row.usageDetails),
    providedCostDetails: numberMap(row.providedCostDetails),
    costDetails: numberMap(row.costDetails),
    metadata: JSON.parse(metadataJson),
  };
}

/** Display fields only. Without a version filter, use each source's newest processed facet version; with one, its newest row. */
export async function getLatestFacetSummaries(
  projectId: string,
  facetId: string,
  facetVersion: number | undefined,
  timeRange: TopicTimeRange,
  traceIds?: string[],
) {
  const scopeSql = `facet_id = {facetId:String}
    ${facetVersion ? "AND facet_version = {facetVersion:UInt32}" : ""}
    ${traceIds ? "AND trace_id IN {traceIds:Array(String)}" : ""}`;
  const read = (batch?: string[]) =>
    queryClickhouse<
      Pick<
        TopicSummary,
        | "projectId"
        | "facetId"
        | "facetVersion"
        | "traceId"
        | "sessionId"
        | "state"
        | "summary"
        | "environment"
      > & { unitStartTimeMs: string; createdAtMs: string }
    >({
      query: `SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId,
      processing_state AS state, summary, environment,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      toUnixTimestamp64Milli(created_at) AS createdAtMs
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
        ${facetVersion ? "" : `AND ${latestSummaryFilterSql(scopeSql, summarySourceKeySql)}`}
      ORDER BY ${facetVersion ? "" : "facet_version DESC, "}created_at DESC
      LIMIT 1 BY ${facetVersion ? sourceKeySql : "project_id, trace_id, if(trace_id = '', session_id, '')"}`,
      params: {
        projectId,
        ...timeRangeParams(timeRange),
        facetId,
        ...(facetVersion ? { facetVersion } : {}),
        ...(batch ? { traceIds: batch } : {}),
      },
      tags: { route: "topics-latest-summaries", projectId },
    });
  // Id lists go in the request URL, so large ones are read in batches.
  const rows = [];
  for (const batch of traceIds
    ? chunk(traceIds, LOOKUP_BATCH_SIZE)
    : [undefined])
    rows.push(...(await read(batch)));
  return rows
    .filter((row) => !isInternalEvalEnvironment(row.environment))
    .map((row) => ({
      projectId: row.projectId,
      facetId: row.facetId,
      facetVersion: row.facetVersion,
      state: row.state,
      summary: row.summary,
      ...summarySourceAndTimestamps(row),
    }));
}

const clusteringSummaryScopeSql = `unit_type = 'trace' AND facet_id = {facetId:String}
  AND facet_version = {facetVersion:UInt32}`;

/** Trace IDs selected inside ClickHouse; see selectTopicCohortTraces. */
export type TopicCohortTraces = {
  query: string;
  params: Record<string, unknown>;
};

/**
 * Restricts clustering to an analysis' traces, joined with summaries inside
 * ClickHouse. With a sample, a seeded random sample of at most `limit`
 * summarized cohort traces per facet is used, so the same seed selects the
 * same traces for a preview and its run.
 */
export type TopicClusteringCohort = {
  traces?: TopicCohortTraces;
  sample?: { seed: string; limit: number };
};

function cohortFilterSql(cohort: TopicClusteringCohort | undefined) {
  return cohort?.traces ? ` AND trace_id IN (${cohort.traces.query})` : "";
}

function cohortSampleSql(
  cohort: TopicClusteringCohort | undefined,
  limitBy = "",
) {
  return cohort?.sample
    ? `ORDER BY cityHash64(trace_id, {cohortSeed:String}), trace_id
      LIMIT {cohortLimit:UInt64}${limitBy ? ` BY ${limitBy}` : ""}`
    : "";
}

function cohortParams(cohort: TopicClusteringCohort | undefined) {
  return {
    ...cohort?.traces?.params,
    ...(cohort?.sample
      ? { cohortSeed: cohort.sample.seed, cohortLimit: cohort.sample.limit }
      : {}),
  };
}

function clusteringSummariesSql(
  columns: string,
  rowColumns = "*",
  cohort?: TopicClusteringCohort,
  sampleSql = "",
) {
  const scopeSql = clusteringSummaryScopeSql + sampleSql;
  return `SELECT ${columns} FROM (
      SELECT * FROM (
        SELECT ${rowColumns}, embedding.size0 AS dimensions FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
          AND ${latestSummaryFilterSql(scopeSql)}
        ORDER BY created_at DESC
        LIMIT 1 BY ${sourceKeySql}
      ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
        AND dimensions = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment NOT IN {publicInternalEnvironments:Array(String)}${cohortFilterSql(cohort)}
      ${cohortSampleSql(cohort)}
    )`;
}

const TOPIC_CLUSTERING_CAPACITY_ERROR =
  "Topics clustering exceeds this worker's capacity. Choose a smaller time window; no partial cohort was used.";

export async function getTopicClusteringSummaries(
  projectId: string,
  facetId: string,
  facetVersion: number,
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
  limits: { maxRows: number; maxBytes: number },
  cohort?: TopicClusteringCohort,
): Promise<TopicSummary[]> {
  const capacityError = () => new Error(TOPIC_CLUSTERING_CAPACITY_ERROR);
  if (
    !Number.isSafeInteger(limits.maxRows) ||
    limits.maxRows < 1 ||
    limits.maxRows >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 1
  )
    throw new Error("Topics clustering limits must be positive safe integers.");
  const [{ count }] = await getTopicSummaryCounts(
    projectId,
    [{ facetId, version: facetVersion }],
    embeddingConfig,
    timeRange,
    cohort,
  );
  if (
    count > limits.maxRows ||
    count * embeddingConfig.embeddingDimensions * 8 > limits.maxBytes
  )
    throw capacityError();

  const summaries: TopicSummary[] = [];
  let bytes = 0;
  try {
    for await (const row of queryClickhouseStream<SummaryRow>({
      query: `${clusteringSummariesSql(summaryColumns, "*", cohort)}
        ORDER BY trace_id LIMIT {maximumRows:UInt64}`,
      params: {
        ...cohortParams(cohort),
        projectId,
        facetId,
        facetVersion,
        ...embeddingConfig,
        ...timeRangeParams(timeRange),
        internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
        publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
        maximumRows: limits.maxRows + 1,
      },
      tags: { route: "topics-clustering-summaries", projectId },
      clickhouseSettings: {
        max_result_bytes: String(limits.maxBytes),
        result_overflow_mode: "throw",
      },
    })) {
      const { embedding, ...fields } = row;
      // Budget decoded doubles and UTF-16 text separately from transport bytes.
      // Object headers, parsed metadata, and numerical-fit copies need extra RAM.
      bytes += embedding.length * 8 + JSON.stringify(fields).length * 2 + 256;
      if (summaries.length >= limits.maxRows || bytes > limits.maxBytes)
        throw capacityError();
      summaries.push(summaryResult(row));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /TOO_MANY_ROWS_OR_BYTES|Limit for result exceeded/.test(error.message)
    )
      throw capacityError();
    throw error;
  }
  return summaries;
}

const SAMPLED_SUMMARIES_TIMEOUT_SECONDS = 60;

// How far back from the window's end each step reaches; the last step reaches the window's start.
const SAMPLED_SUMMARIES_STEP_DAYS = [7, 14, 30];

/**
 * A stable sample of compatible summaries, up to the limits: units whose unit_hash
 * falls below a bound, so overlapping windows pick the same units. The sample
 * comes from the shortest step (7, then 14 days) that holds enough units, else from the window.
 */
export async function getSampledTopicClusteringSummaries(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
  limits: { maxRows: number; maxBytes: number },
  traces?: (window: TopicTimeRange) => Promise<TopicCohortTraces>,
): Promise<{ summaries: TopicSummary[]; timeRange: TopicTimeRange }> {
  // Vector bytes plus a 2 KB allowance for text; reading enforces the real size.
  const rowBytes = embeddingConfig.embeddingDimensions * 8 + 2048;
  const limit = Math.min(
    limits.maxRows,
    Math.floor(limits.maxBytes / rowBytes),
  );
  if (limit < 1) return { summaries: [], timeRange };
  const options = {
    // A background read: keep it off the primary and bound its CPU.
    preferredClickhouseService: "EventsReadOnly" as const,
    // The client must outlast the server limit for the timeout to be reported as one.
    clickhouseConfigs: {
      request_timeout: (SAMPLED_SUMMARIES_TIMEOUT_SECONDS + 15) * 1000,
    },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: SAMPLED_SUMMARIES_TIMEOUT_SECONDS,
      timeout_overflow_mode: "throw" as const,
    },
  };
  let window = timeRange;
  let cohort: TopicClusteringCohort | undefined;
  let params: Record<string, unknown> = {};
  let count = 0;
  for (const days of SAMPLED_SUMMARIES_STEP_DAYS) {
    const last = days === SAMPLED_SUMMARIES_STEP_DAYS.at(-1);
    window = {
      from: last
        ? timeRange.from
        : new Date(
            Math.max(
              timeRange.from.getTime(),
              timeRange.to.getTime() - days * 86_400_000,
            ),
          ),
      to: timeRange.to,
    };
    const windowTraces = await traces?.(window);
    cohort = windowTraces && { traces: windowTraces };
    params = {
      ...windowTraces?.params,
      projectId,
      facetId: facet.facetId,
      facetVersion: facet.version,
      ...embeddingConfig,
      ...timeRangeParams(window),
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
      limit,
    };
    const [counted] = await queryClickhouse<{ count: string }>({
      query: clusteringSummariesSql(
        "count() AS count",
        "trace_id, processing_state, embedding_model, environment",
        cohort,
      ),
      params,
      tags: { route: "topics-sampled-clustering-count", projectId },
      ...options,
    });
    count = Number(counted?.count ?? 0);
    if (count >= limit || window.from.getTime() <= timeRange.from.getTime())
      break;
  }
  if (count === 0) return { summaries: [], timeRange: window };
  // k = limit / count * 2^64; without a cut every unit is read.
  const sampleBound =
    count > limit
      ? ((BigInt(limit) * 2n ** 64n) / BigInt(count)).toString()
      : null;
  const sampleSql = sampleBound ? " AND unit_hash < {sampleBound:UInt64}" : "";
  const keysSql = `${clusteringSummariesSql(
    "trace_id, unit_start_time, created_at",
    "trace_id, unit_start_time, created_at, processing_state, embedding_model, environment, unit_hash",
    cohort,
    sampleSql,
  )}
    ORDER BY unit_hash, trace_id LIMIT {limit:UInt64}`;
  const summaries: TopicSummary[] = [];
  let bytes = 0;
  for await (const row of queryClickhouseStream<SummaryRow>({
    query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND ${clusteringSummaryScopeSql}${sampleSql}
        AND (trace_id, unit_start_time, created_at) IN (${keysSql})
      ORDER BY unit_hash, trace_id
      LIMIT 1 BY ${sourceKeySql}`,
    params: { ...params, ...(sampleBound ? { sampleBound } : {}) },
    tags: { route: "topics-sampled-clustering-summaries", projectId },
    ...options,
  })) {
    const { embedding, ...fields } = row;
    bytes += embedding.length * 8 + JSON.stringify(fields).length * 2 + 256;
    if (bytes > limits.maxBytes) break;
    summaries.push(summaryResult(row));
  }
  return { summaries, timeRange: window };
}

/** Whether any complete summary of the project was embedded in this embedding space. */
export async function hasTopicEmbeddings(
  projectId: string,
  embeddingConfig: { embeddingModel: string; embeddingDimensions: number },
): Promise<boolean> {
  const rows = await queryClickhouse<{ found: number }>({
    query: `SELECT 1 AS found FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND processing_state = 'complete'
        AND embedding_model = {embeddingModel:String}
        AND embedding.size0 = {embeddingDimensions:UInt32}
      LIMIT 1`,
    params: { projectId, ...embeddingConfig },
    tags: { route: "topics-has-embeddings", projectId },
  });
  return rows.length > 0;
}

/**
 * Whether any compatible complete summary of the facet exists in the window: one row, not a count.
 * Unlike getTopicSummaryCounts it does not resolve each unit's latest version, so a unit whose latest
 * revision is no longer complete can still count; at worst that schedules one unneeded refit.
 */
export async function hasCompatibleTopicSummaries(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
): Promise<boolean> {
  const rows = await queryClickhouse<{ found: number }>({
    query: `SELECT 1 AS found FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND unit_type = 'trace' AND processing_state = 'complete'
        AND embedding_model = {embeddingModel:String}
        AND embedding.size0 = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment NOT IN {publicInternalEnvironments:Array(String)}
      LIMIT 1`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetId: facet.facetId,
      facetVersion: facet.version,
      ...embeddingConfig,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
    },
    tags: { route: "topics-has-compatible-summaries", projectId },
    clickhouseSettings: { max_threads: 1 },
  });
  return rows.length > 0;
}

/** Project onboarding readiness, cached for 30 minutes when ready and 30 seconds when empty. */
export async function hasStoredTopicSummaries(
  projectId: string,
): Promise<boolean> {
  const cacheKey = `langfuse:topics:has-summaries:${projectId}`;
  try {
    const cached = await redis?.get(cacheKey);
    if (cached === "1") return true;
    if (cached === "0") return false;
  } catch (error) {
    traceException(error);
    logger.warn("Failed to read cached Topics summary readiness", {
      projectId,
      error,
    });
  }
  const rows = await queryClickhouse<{ found: number }>({
    query: `SELECT 1 AS found FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND unit_type = 'trace' AND processing_state = 'complete'
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment NOT IN {publicInternalEnvironments:Array(String)}
      LIMIT 1`,
    params: {
      projectId,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
    },
    tags: { route: "topics-has-summaries", projectId },
    clickhouseSettings: { max_threads: 1 },
  });
  const hasSummaries = rows.length > 0;
  try {
    await redis?.set(
      cacheKey,
      hasSummaries ? "1" : "0",
      "EX",
      hasSummaries ? 1800 : 30,
    );
  } catch (error) {
    traceException(error);
    logger.warn("Failed to cache Topics summary readiness", {
      projectId,
      error,
    });
  }
  return hasSummaries;
}

/** Estimates sum the stored rows. A retried insert can count twice until ClickHouse merges it. */
async function readTopicCosts(
  projectId: string,
  ids: string[],
  route: string,
  query: string,
): Promise<Record<string, number>> {
  const costs: Record<string, number> = {};
  try {
    for (const batch of chunk([...new Set(ids)], LOOKUP_BATCH_SIZE)) {
      const rows = await queryClickhouse<{ id: string; cost: string }>({
        query,
        params: { projectId, ids: batch },
        preferredClickhouseService: "EventsReadOnly",
        clickhouseSettings: { max_threads: 2, max_execution_time: 30 },
        tags: { route, projectId },
      });
      for (const row of rows) costs[row.id] = Number(row.cost);
    }
  } catch (error) {
    traceException(error);
    logger.warn("Failed to estimate Topics costs", { projectId, route, error });
  }
  return costs;
}

export function getTopicExecutionCosts(
  projectId: string,
  executionIds: string[],
) {
  return readTopicCosts(
    projectId,
    executionIds,
    "topics-execution-costs",
    `
    SELECT execution_id AS id, sum(total_cost) AS cost
    FROM topic_facet_summaries
    WHERE project_id = {projectId:String} AND execution_id IN {ids:Array(String)}
      AND mapContains(cost_details, 'total')
    GROUP BY execution_id`,
  );
}

export function getTopicRuleProcessingCosts(
  projectId: string,
  ruleIds: string[],
) {
  return readTopicCosts(
    projectId,
    ruleIds,
    "topics-rule-processing-cost",
    `
    WITH arrayDistinct(rule_ids) AS owners
    SELECT arrayJoin(owners) AS id, sum(total_cost / greatest(length(owners), 1)) AS cost
    FROM topic_facet_summaries
    PREWHERE project_id = {projectId:String} AND empty(execution_id) AND hasAny(rule_ids, {ids:Array(String)})
    WHERE id IN {ids:Array(String)} AND mapContains(cost_details, 'total')
    GROUP BY id`,
  );
}

/** Reusing a topic version leaves its naming cost with the run that created it. */
export function getTopicRunNamingCosts(projectId: string, runIds: string[]) {
  return readTopicCosts(
    projectId,
    runIds,
    "topics-run-naming-costs",
    `
    SELECT created_by_run_id AS id, sum(cost_details['total']) AS cost
    FROM topics
    WHERE project_id = {projectId:String} AND created_by_run_id IN {ids:Array(String)}
      AND mapContains(cost_details, 'total')
    GROUP BY created_by_run_id`,
  );
}

// Bounds the preview count; a 14-day cohort takes about 10 s on the largest tenants.
const COHORT_SUMMARY_COUNT_TIMEOUT_SECONDS = 30;

/** Count current compatible summaries without loading summary text or vectors. */
export async function getTopicSummaryCounts(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
  cohort?: TopicClusteringCohort,
): Promise<{ facetId: string; facetVersion: number; count: number }[]> {
  if (!facets.length) return [];
  const scopeSql = `unit_type = 'trace'
    AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})`;
  const rows = await queryClickhouse<{
    facetId: string;
    facetVersion: number;
    count: string;
  }>({
    query: `SELECT facet_id AS facetId, facet_version AS facetVersion, count() AS count FROM (
      SELECT facet_id, facet_version, trace_id FROM (
        SELECT facet_id, facet_version, trace_id, processing_state, embedding_model, embedding.size0 AS dimensions, environment
        FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
          AND ${latestSummaryFilterSql(scopeSql)}
        ORDER BY created_at DESC
        LIMIT 1 BY ${sourceKeySql}
      ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
        AND dimensions = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment NOT IN {publicInternalEnvironments:Array(String)}${cohortFilterSql(cohort)}
      ${cohortSampleSql(cohort, "facet_id, facet_version")}
    )
    GROUP BY facet_id, facet_version`,
    params: {
      projectId,
      ...cohortParams(cohort),
      ...timeRangeParams(timeRange),
      facetIds: facets.map(({ facetId }) => facetId),
      facetVersions: facets.map(({ version }) => version),
      ...embeddingConfig,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
    },
    tags: { route: "topics-summary-counts", projectId },
    // A cohort scans events, so keep it off the primary like the other preview reads.
    ...(cohort
      ? {
          preferredClickhouseService: "EventsReadOnly" as const,
          // The client must outlast the server limit for the timeout to be reported as one.
          clickhouseConfigs: {
            request_timeout: (COHORT_SUMMARY_COUNT_TIMEOUT_SECONDS + 15) * 1000,
          },
          clickhouseSettings: {
            max_execution_time: COHORT_SUMMARY_COUNT_TIMEOUT_SECONDS,
            timeout_overflow_mode: "throw" as const,
          },
        }
      : {}),
  });
  return facets.map(({ facetId, version }) => ({
    facetId,
    facetVersion: version,
    count: Number(
      rows.find(
        (row) => row.facetId === facetId && row.facetVersion === version,
      )?.count ?? 0,
    ),
  }));
}

/**
 * Approximate distinct traces per facet with a complete summary at the facet
 * version and embedding, for setup's reuse and fit-size decisions. Unlike
 * getTopicSummaryCounts, a re-summarized trace is not resolved to its latest
 * result, and the rule's traces filter the scan itself, so memory stays flat.
 */
export async function getTopicSetupSummaryCounts(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
  traces?: TopicCohortTraces,
): Promise<{ facetId: string; count: number }[]> {
  if (!facets.length) return [];
  const rows = await queryClickhouse<{ facetId: string; count: string }>({
    query: `SELECT facet_id AS facetId, uniqCombined(trace_id) AS count
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND unit_type = 'trace'
        AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
        AND processing_state = 'complete'
        AND embedding_model = {embeddingModel:String}
        AND embedding.size0 = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment NOT IN {publicInternalEnvironments:Array(String)}${cohortFilterSql(traces && { traces })}
      GROUP BY facet_id`,
    params: {
      ...traces?.params,
      projectId,
      ...timeRangeParams(timeRange),
      facetIds: facets.map(({ facetId }) => facetId),
      facetVersions: facets.map(({ version }) => version),
      ...embeddingConfig,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicInternalEnvironments: [...PUBLIC_INTERNAL_EVAL_ENVIRONMENTS],
    },
    tags: { route: "topics-setup-summary-counts", projectId },
  });
  return facets.map(({ facetId }) => ({
    facetId,
    count: Number(rows.find((row) => row.facetId === facetId)?.count ?? 0),
  }));
}

/**
 * Per facet, how many of the given traces got a final result since `since`, and
 * how many of those are complete with the embedding.
 */
export async function countTopicTraceSummaries(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
  traceIds: string[],
  since: Date,
  from: Date,
): Promise<{ facetId: string; settled: number; complete: number }[]> {
  if (!facets.length || !traceIds.length)
    return facets.map(({ facetId }) => ({ facetId, settled: 0, complete: 0 }));
  const rows = await queryClickhouse<{
    facetId: string;
    settled: string;
    complete: string;
  }>({
    query: `SELECT facet_id AS facetId,
        uniqExact(trace_id) AS settled,
        uniqExactIf(trace_id, processing_state = 'complete'
          AND embedding_model = {embeddingModel:String}
          AND embedding.size0 = {embeddingDimensions:UInt32}) AS complete
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND unit_start_time >= {from:DateTime64(3)}
        AND trace_id IN {traceIds:Array(String)}
        AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
        AND created_at >= {since:DateTime64(3)}
      GROUP BY facet_id`,
    params: {
      projectId,
      traceIds,
      facetIds: facets.map(({ facetId }) => facetId),
      facetVersions: facets.map(({ version }) => version),
      from: convertDateToClickhouseDateTime(from),
      since: convertDateToClickhouseDateTime(since),
      ...embeddingConfig,
    },
    tags: { route: "topics-setup-progress", projectId },
  });
  return facets.map(({ facetId }) => {
    const row = rows.find((item) => item.facetId === facetId);
    return {
      facetId,
      settled: Number(row?.settled ?? 0),
      complete: Number(row?.complete ?? 0),
    };
  });
}

/** writeTopicSummaries rejects the whole insert if any row fails this check. */
export function isValidTopicSummary(row: TopicSummary): boolean {
  return (
    topicSourceSchema.safeParse(row).success &&
    typeof row.environment === "string" &&
    row.embedding.every(Number.isFinite) &&
    !(row.state === "complete" && row.embedding.length === 0)
  );
}

export async function writeTopicSummaries(rows: TopicSummary[]): Promise<void> {
  if (!rows.length) return;
  if (!rows.every(isValidTopicSummary))
    throw new Error("Invalid Topics summary result.");
  await insertTopicRows("topic_facet_summaries", rows, topicSummaryRecord);
}

export async function writeTopicAssignments(
  rows: TopicAssignment[],
): Promise<void> {
  if (!rows.length) return;
  for (const row of rows) {
    if (
      !topicSourceSchema.safeParse(row).success ||
      typeof row.environment !== "string" ||
      (row.topicId === null) !== (row.topicVersionId === null) ||
      (row.distance !== null && !Number.isFinite(row.distance)) ||
      (row.runnerUpDistance !== null &&
        !Number.isFinite(row.runnerUpDistance)) ||
      (row.coordinates !== null &&
        (!row.runId ||
          row.coordinates.length !== 2 ||
          !row.coordinates.every(Number.isFinite)))
    )
      throw new Error("Invalid Topics assignment.");
  }
  await insertTopicRows("topic_assignments", rows, topicAssignmentRecord);
}

/** Serializes a validated summary for a JSONEachRow insert. */
export function topicSummaryRecord(row: TopicSummary) {
  return {
    project_id: row.projectId,
    facet_id: row.facetId,
    facet_version: row.facetVersion,
    trace_id: row.traceId ?? "",
    session_id: row.sessionId ?? "",
    trigger_type: row.triggerType,
    rule_ids: row.ruleIds,
    execution_id: row.executionId ?? "",
    environment: row.environment,
    trace_name: row.traceId ? row.traceName : "",
    unit_start_time: convertDateToClickhouseDateTime(
      new Date(row.unitStartTime),
    ),
    processing_state: row.state,
    summary: row.summary,
    embedding: row.embedding,
    transcript_id: row.transcriptId,
    transcript_version: row.transcriptVersion,
    transcript_bytes: row.transcriptBytes,
    summary_model: row.summaryModel,
    embedding_model: row.embeddingModel,
    provided_usage_details: row.providedUsageDetails,
    usage_details: row.usageDetails,
    provided_cost_details: row.providedCostDetails,
    cost_details: row.costDetails,
    created_at: convertDateToClickhouseDateTime(new Date(row.createdAt)),
    metadata: JSON.stringify(row.metadata),
  };
}

/** A `topic_facet_summaries` row as inserted with JSONEachRow. */
export type TopicFacetSummaryRecordInsertType = ReturnType<
  typeof topicSummaryRecord
>;

/** Serializes a validated assignment for a JSONEachRow insert. */
export function topicAssignmentRecord(row: TopicAssignment) {
  return {
    project_id: row.projectId,
    facet_id: row.facetId,
    facet_version: row.facetVersion,
    trace_id: row.traceId ?? "",
    session_id: row.sessionId ?? "",
    unit_start_time: convertDateToClickhouseDateTime(
      new Date(row.unitStartTime),
    ),
    summary_processed_at: convertDateToClickhouseDateTime(
      new Date(row.summaryProcessedAt),
    ),
    environment: row.environment,
    trace_name: row.traceId ? row.traceName : "",
    clustering_run_id: row.runId ?? "",
    rule_id: row.ruleId ?? "",
    topic_stable_id: row.topicId ?? "",
    topic_id: row.topicVersionId ?? "",
    distance: row.distance,
    runner_up_distance: row.runnerUpDistance,
    origin: row.origin,
    coordinates: row.coordinates ?? [],
    created_at: convertDateToClickhouseDateTime(new Date(row.createdAt)),
  };
}

/** A `topic_assignments` row as inserted with JSONEachRow. */
export type TopicAssignmentRecordInsertType = ReturnType<
  typeof topicAssignmentRecord
>;

const assignmentColumns = `project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId,
      session_id AS sessionId,
      environment, trace_name AS traceName,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      coordinates,
      toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
      clustering_run_id AS runId, rule_id AS ruleId,
      topic_stable_id AS topicId, topic_id AS topicVersionId, distance,
      runner_up_distance AS runnerUpDistance, origin,
      toUnixTimestamp64Milli(created_at) AS createdAtMs`;
type AssignmentRow = Omit<
  TopicAssignment,
  | "unitStartTime"
  | "createdAt"
  | "summaryProcessedAt"
  | "runId"
  | "ruleId"
  | "coordinates"
> & {
  unitStartTimeMs: string;
  summaryProcessedAtMs: string;
  createdAtMs: string;
  runId: string;
  ruleId: string;
  coordinates: number[];
};
function assignmentResult({
  unitStartTimeMs,
  summaryProcessedAtMs,
  createdAtMs,
  ...row
}: AssignmentRow): TopicAssignment {
  return {
    ...row,
    ...topicSourceSchema.parse({
      traceId: row.traceId || null,
      sessionId: row.sessionId || null,
    }),
    runId: row.runId || null,
    ruleId: row.ruleId || null,
    topicId: row.topicId || null,
    topicVersionId: row.topicVersionId || null,
    coordinates:
      row.coordinates.length === 2
        ? [row.coordinates[0], row.coordinates[1]]
        : null,
    unitStartTime: new Date(Number(unitStartTimeMs)).toISOString(),
    summaryProcessedAt: new Date(Number(summaryProcessedAtMs)).toISOString(),
    createdAt: new Date(Number(createdAtMs)).toISOString(),
  };
}

/** A published map's cohort excludes later online assignments to the same map. */
export async function readTopicRunTraceIds(
  projectId: string,
  facet: TopicFacetRef,
  runId: string,
  timeRange: TopicTimeRange,
  maxRows: number,
): Promise<string[]> {
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    maxRows >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("Topics continuity limit must be a positive safe integer.");
  const rows = await queryClickhouse<{ traceId: string }>({
    query: `SELECT DISTINCT trace_id AS traceId FROM topic_assignments
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND clustering_run_id = {runId:String}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND origin = 'initial'
        AND trace_id != ''
      ORDER BY traceId LIMIT {maximumRows:UInt64}`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      runId,
      facetId: facet.facetId,
      facetVersion: facet.version,
      maximumRows: maxRows + 1,
    },
    tags: { route: "topics-run-summaries", projectId },
  });
  if (rows.length > maxRows)
    throw new Error(
      "Previous Topics map exceeds this worker's clustering capacity; its continuity cohort cannot be loaded.",
    );
  return rows.map((row) => row.traceId);
}

/** Initial membership includes rows with missing coordinates, excluding online assignments. */
export async function readTopicMapAssignments(
  projectId: string,
  facet: TopicFacetRef,
  runId: string,
  timeRange: TopicTimeRange,
): Promise<TopicAssignment[]> {
  const rows = await queryClickhouse<AssignmentRow>({
    query: `SELECT ${assignmentColumns} FROM topic_assignments
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND clustering_run_id = {runId:String}
        AND origin = 'initial' AND trace_id != ''
      ORDER BY created_at DESC
      LIMIT 1 BY ${sourceKeySql}`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      runId,
      facetId: facet.facetId,
      facetVersion: facet.version,
    },
    tags: { route: "topics-map", projectId },
  });
  return rows.map(assignmentResult);
}

/** Distinct sources with an initial assignment in a run; retried writes cannot inflate it. */
export async function countTopicAssignmentSources(
  projectId: string,
  facet: TopicFacetRef,
  runId: string,
  timeRange: TopicTimeRange,
): Promise<number> {
  const [row] = await queryClickhouse<{ sources: string }>({
    query: `SELECT uniqExact(trace_id, if(trace_id = '', session_id, '')) AS sources
      FROM topic_assignments
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND clustering_run_id = {runId:String} AND origin = 'initial'`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetId: facet.facetId,
      facetVersion: facet.version,
      runId,
    },
    tags: { route: "topics-assignment-coverage", projectId },
  });
  return Number(row?.sources ?? 0);
}

export async function readTopicAssignments(
  projectId: string,
  facet: TopicFacetRef,
  sources: Pick<TopicSummary, "traceId" | "sessionId">[],
  runId: string,
  timeRange: TopicTimeRange,
): Promise<TopicAssignment[]> {
  const rows: AssignmentRow[] = [];
  for (const batch of sourceBatches(sources)) {
    rows.push(
      ...(await queryClickhouse<AssignmentRow>({
        query: `SELECT ${assignmentColumns}
      FROM topic_assignments WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND clustering_run_id = {runId:String} AND ${sourceFilterSql}
      ORDER BY created_at DESC, origin DESC
      LIMIT 1 BY ${sourceKeySql}`,
        params: {
          projectId,
          ...timeRangeParams(timeRange),
          facetId: facet.facetId,
          facetVersion: facet.version,
          ...batch,
          runId,
        },
        tags: { route: "topics-assignments", projectId },
      })),
    );
  }
  return rows.map(assignmentResult);
}

/** Current membership on each of the facet's published maps, preferring the newest facet version. */
export async function readLatestTopicAssignments(
  projectId: string,
  facetId: string,
  publishedRunIds: string[],
  timeRange: TopicTimeRange,
  traceIds?: string[],
): Promise<TopicAssignment[]> {
  if (!publishedRunIds.length) return [];
  const rows = await queryClickhouse<AssignmentRow>({
    query: `SELECT ${assignmentColumns} FROM topic_assignments
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND facet_id = {facetId:String}
        AND clustering_run_id IN {publishedRunIds:Array(String)}
        ${traceIds ? "AND trace_id IN {traceIds:Array(String)}" : ""}
      ORDER BY facet_version DESC, created_at DESC, origin DESC
      LIMIT 1 BY project_id, facet_id, clustering_run_id, trace_id, if(trace_id = '', session_id, '')`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetId,
      publishedRunIds,
      ...(traceIds ? { traceIds } : {}),
    },
    tags: { route: "topics-current-assignments", projectId },
  });
  return rows.map(assignmentResult);
}

/**
 * Each trace's latest placement per facet and rule among the given completed runs: the rules'
 * runs and the published maps without a rule (snapshots); outliers, with an empty topic id, only when asked.
 */
export async function readCurrentTraceTopics(
  projectId: string,
  {
    traces,
    facetIds,
    runIds,
    includeOutliers = false,
  }: {
    traces: { traceId: string; timestamp: Date }[];
    facetIds: string[];
    runIds: string[];
    includeOutliers?: boolean;
  },
) {
  const times = traces.map((trace) => trace.timestamp.getTime());
  // A row can start up to OBSERVATIONS_TO_TRACE_INTERVAL_DAYS after the trace's first observation.
  const timeRange = {
    from: new Date(Math.min(...times) - TRACE_START_SLACK_MS),
    to: new Date(Math.max(...times) + 1),
  };
  const rows = await queryClickhouse<{
    traceId: string;
    facetId: string;
    topicId: string;
    topicVersionId: string;
    runId: string;
    ruleId: string;
  }>({
    query: `SELECT trace_id AS traceId, facet_id AS facetId, topic_stable_id AS topicId,
        topic_id AS topicVersionId, clustering_run_id AS runId, rule_id AS ruleId
      FROM topic_assignments_by_trace
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id IN {facetIds:Array(String)} AND trace_id IN {traceIds:Array(String)}
        AND clustering_run_id IN {runIds:Array(String)}
      ORDER BY created_at DESC, origin DESC
      LIMIT 1 BY facet_id, rule_id, trace_id`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetIds,
      traceIds: [...new Set(traces.map((trace) => trace.traceId))],
      runIds,
    },
    tags: { route: "topics-trace-topics", projectId },
  });
  return includeOutliers ? rows : rows.filter((row) => row.topicId !== "");
}

/**
 * `e.trace_id [NOT] IN (…)` for traces whose current topic in one facet is one of the
 * stable topic ids. Parameters carry `prefix` so several filters fit one events query.
 */
export function currentTopicTraceIdsCondition(
  prefix: string,
  {
    projectId,
    facetId,
    topicIds,
    publishedRunIds,
    timeRange,
    negated,
  }: {
    projectId: string;
    facetId: string;
    topicIds: string[];
    publishedRunIds: string[];
    timeRange: TopicTimeRange;
    negated: boolean;
  },
) {
  // Only traces that ever had one of the topics can currently have it; deduping just those
  // keeps memory proportional to the match instead of every assigned trace in the window.
  const sql = `SELECT trace_id FROM (${currentTraceAssignmentsSql(
    `facet_id = {facetId:String} AND trace_id != '' AND trace_id IN (
      SELECT trace_id FROM topic_assignments
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id = {facetId:String} AND clustering_run_id IN {publishedRunIds:Array(String)}
        AND topic_stable_id IN {topicIds:Array(String)}
    )`,
  )}) WHERE topic_stable_id IN {topicIds:Array(String)}`;
  const params: Record<string, unknown> = {
    projectId,
    ...timeRangeParams(timeRange),
    facetId,
    topicIds,
    publishedRunIds,
  };
  return {
    query: `e.trace_id ${negated ? "NOT IN" : "IN"} (${sql.replace(
      /\{(\w+):/g,
      `{${prefix}_$1:`,
    )})`,
    params: Object.fromEntries(
      Object.entries(params).map(([name, value]) => [
        `${prefix}_${name}`,
        value,
      ]),
    ),
  };
}

// A trace's current topic per map: its newest assignment from each rule's published run.
function currentTraceAssignmentsSql(scopeSql: string) {
  return `SELECT trace_id, facet_id, topic_stable_id, topic_id, clustering_run_id
    FROM topic_assignments
    WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
      AND clustering_run_id IN {publishedRunIds:Array(String)}
    ORDER BY created_at DESC, origin DESC
    LIMIT 1 BY facet_id, clustering_run_id, trace_id`;
}

/** Source time span of the traces' summaries, found through the trace_id bloom filter; null when none was summarized. */
export async function getTopicTraceUnitTimeRange(
  projectId: string,
  traceIds: string[],
  timeRange: TopicTimeRange,
): Promise<TopicTimeRange | null> {
  const [row] = await queryClickhouse<{
    found: string;
    fromMs: string;
    toMs: string;
  }>({
    query: `SELECT count() AS found,
      toUnixTimestamp64Milli(min(unit_start_time)) AS fromMs,
      toUnixTimestamp64Milli(max(unit_start_time)) AS toMs
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND trace_id IN {traceIds:Array(String)}`,
    params: { projectId, ...timeRangeParams(timeRange), traceIds },
    tags: { route: "topics-trace-unit-time", projectId },
  });
  if (!row || Number(row.found) === 0) return null;
  return {
    from: new Date(Number(row.fromMs)),
    to: new Date(Number(row.toMs) + 1),
  };
}

// Deletes do not propagate through the materialized view, so its target table is listed too.
const TOPIC_CLICKHOUSE_TABLES = [
  "topic_facet_summaries",
  "topic_assignments",
  "topic_assignments_by_trace",
  "topics",
] as const;

/** Deletes a project's Topics rows from ClickHouse; returns whether any table had rows. */
export async function deleteTopicDataByProjectId(
  projectId: string,
): Promise<boolean> {
  const deleted = await Promise.all(
    TOPIC_CLICKHOUSE_TABLES.map(async (table) => {
      const tags = { route: "topics-project-delete", projectId };
      const rows = await queryClickhouse<{ 1: number }>({
        query: `SELECT 1 FROM ${table} WHERE project_id = {projectId: String} LIMIT 1`,
        params: { projectId },
        tags,
      });
      if (rows.length === 0) return false;
      await commandClickhouse({
        query: `DELETE FROM ${table} WHERE project_id = {projectId: String}`,
        params: { projectId },
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags,
      });
      return true;
    }),
  );
  return deleted.some(Boolean);
}

/**
 * Deletes summaries and assignments whose source started before the cutoff.
 * Topic definitions are reused across runs, so they do not expire by age.
 */
export async function deleteTopicResultsOlderThan(
  projectId: string,
  beforeDate: Date,
): Promise<boolean> {
  const params = {
    projectId,
    cutoff: convertDateToClickhouseDateTime(beforeDate),
  };
  const deleted = await Promise.all(
    (
      [
        "topic_facet_summaries",
        "topic_assignments",
        "topic_assignments_by_trace",
      ] as const
    ).map(async (table) => {
      const where =
        "project_id = {projectId: String} AND unit_start_time < {cutoff: DateTime64(3)}";
      const tags = { route: "topics-retention", projectId };
      const rows = await queryClickhouse<{ 1: number }>({
        query: `SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`,
        params,
        tags,
      });
      if (rows.length === 0) return false;
      await commandClickhouse({
        query: `DELETE FROM ${table} WHERE ${where}`,
        params,
        clickhouseConfigs: {
          request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
        },
        tags,
      });
      return true;
    }),
  );
  return deleted.some(Boolean);
}
