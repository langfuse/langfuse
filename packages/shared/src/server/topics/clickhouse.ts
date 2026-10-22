/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import { buildClickHouseLogComment } from "../clickhouse/queryTags";
import {
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
import { prisma } from "../../db";
import { logger } from "../logger";
import { traceException } from "../instrumentation";
import { redis } from "../redis/redis";
import { chunk } from "lodash";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  isInternalEvalEnvironment,
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
} from "../llm/isInternalEvalEnvironment";

const sourceKeySql =
  "project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')";

const unitTimeFilterSql =
  "unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}";

const summaryVersionKeySql =
  "facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at";
const summarySourceKeySql =
  "facet_id, trace_id, if(trace_id = '', session_id, '')";

// Payloads are time-bounded; source-index metadata must include versions that moved
// outside that window. State, model and dimension filters apply after this check.
// Candidate keys scope the metadata scan; a scalar facet_version predicate there
// prevents ClickHouse from selecting the latest_source_versions projection.
function latestSummaryFilterSql(scopeSql: string, latestKeySql = sourceKeySql) {
  return `(${summaryVersionKeySql}) IN (
    SELECT ${summaryVersionKeySql} FROM topic_facet_summaries
    WHERE project_id = {projectId:String}
      AND (${summarySourceKeySql}) IN (
        SELECT ${summarySourceKeySql} FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
        GROUP BY ${summarySourceKeySql}
      )
    ORDER BY facet_version DESC, processed_at DESC
    LIMIT 1 BY ${latestKeySql}
  )`;
}

function timeRangeParams(timeRange: TopicTimeRange) {
  const { from, to } = topicTimeRangeSchema.parse(timeRange);
  return {
    from: convertDateToClickhouseDateTime(from),
    to: convertDateToClickhouseDateTime(to),
  };
}

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
        "createdAt" | "metadata" | "representativeSummaries"
      > & {
        createdAtMs: string;
        metadataJson: string;
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
        centroid, radius, tags, representative_summaries AS representativeSummaries,
        metadata AS metadataJson
        FROM topics
        WHERE project_id = {projectId:String} AND id IN {ids:Array(String)}
          AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
        ORDER BY created_at DESC LIMIT 1 BY project_id, id`,
      params: { projectId, ids, ...timeRangeParams(timeRange) },
      tags: { route: "topics-definitions", projectId },
    });
    definitions.push(
      ...rows.map(({ createdAtMs, metadataJson, ...row }) => ({
        ...row,
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
  strings(row.tags);
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
        created_at, name, description, centroid, radius, tags,
        representative_summaries, metadata) FORMAT RowBinary`,
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
  environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
  processing_state AS state, summary, embedding,
  transcript_id AS transcriptId, transcript_version AS transcriptVersion,
  summary_model AS summaryModel, embedding_model AS embeddingModel,
  provided_usage_details AS providedUsageDetails, usage_details AS usageDetails,
  provided_cost_details AS providedCostDetails, cost_details AS costDetails,
  toUnixTimestamp64Milli(processed_at) AS processedAtMs, metadata AS metadataJson`;

type SummaryRow = Omit<
  TopicSummary,
  "metadata" | "unitStartTime" | "processedAt"
> & { metadataJson: string; unitStartTimeMs: string; processedAtMs: string };
const numberMap = (values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Number(value)]),
  );
function summarySourceAndTimestamps(
  row: Pick<
    SummaryRow,
    "traceId" | "sessionId" | "unitStartTimeMs" | "processedAtMs"
  >,
) {
  return {
    ...topicSourceSchema.parse({
      traceId: row.traceId || null,
      sessionId: row.sessionId || null,
    }),
    unitStartTime: new Date(Number(row.unitStartTimeMs)).toISOString(),
    processedAt: new Date(Number(row.processedAtMs)).toISOString(),
  };
}

function summaryResult(row: SummaryRow): TopicSummary {
  const { metadataJson, unitStartTimeMs, processedAtMs, ...rest } = row;
  return {
    ...rest,
    ...summarySourceAndTimestamps(row),
    providedUsageDetails: numberMap(row.providedUsageDetails),
    usageDetails: numberMap(row.usageDetails),
    providedCostDetails: numberMap(row.providedCostDetails),
    costDetails: numberMap(row.costDetails),
    metadata: JSON.parse(metadataJson),
  };
}

export async function listTopicSummaries(
  projectId: string,
  filter: (
    | {
        sources: Pick<TopicSummary, "traceId" | "sessionId">[];
        traceIds?: never;
      }
    | { traceIds: string[]; sources?: never }
  ) & { facetId: string; facetVersion: number },
  timeRange: TopicTimeRange,
): Promise<TopicSummary[]> {
  const rows: SummaryRow[] = [];
  const scopeSql = `facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
    AND ${sourceFilterSql}`;
  const sources =
    filter.sources ??
    filter.traceIds.map((traceId) => ({ traceId, sessionId: null }));
  for (const batch of sourceBatches(sources)) {
    rows.push(
      ...(await queryClickhouse<SummaryRow>({
        query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND ${scopeSql} AND ${latestSummaryFilterSql(scopeSql)}
      ORDER BY processed_at DESC LIMIT 1 BY ${sourceKeySql}`,
        params: {
          projectId,
          ...timeRangeParams(timeRange),
          facetId: filter.facetId,
          facetVersion: filter.facetVersion,
          ...batch,
        },
        tags: { route: "topics-summaries", projectId },
      })),
    );
  }
  rows.sort((a, b) => Number(b.processedAtMs) - Number(a.processedAtMs));
  return rows
    .filter((row) => !isInternalEvalEnvironment(row.environment))
    .map(summaryResult);
}
/** Display fields only. Without a version filter, use each source's newest processed facet version. */
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
  const rows = await queryClickhouse<
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
    > & { unitStartTimeMs: string; processedAtMs: string }
  >({
    query: `SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId,
      processing_state AS state, summary, environment,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      toUnixTimestamp64Milli(processed_at) AS processedAtMs
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
        AND ${latestSummaryFilterSql(scopeSql, facetVersion ? sourceKeySql : summarySourceKeySql)}
      ORDER BY ${facetVersion ? "" : "facet_version DESC, "}processed_at DESC
      LIMIT 1 BY ${facetVersion ? sourceKeySql : "project_id, trace_id, if(trace_id = '', session_id, '')"}`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetId,
      ...(facetVersion ? { facetVersion } : {}),
      ...(traceIds ? { traceIds } : {}),
    },
    tags: { route: "topics-latest-summaries", projectId },
  });
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

const clusteringSummaryScopeSql = `trace_id != '' AND facet_id = {facetId:String}
  AND facet_version = {facetVersion:UInt32}`;

function clusteringSummariesSql(columns: string, rowColumns = "*") {
  return `SELECT ${columns} FROM (
      SELECT ${rowColumns}, length(embedding) AS dimensions FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${clusteringSummaryScopeSql}
        AND ${latestSummaryFilterSql(clusteringSummaryScopeSql)}
      ORDER BY processed_at DESC
      LIMIT 1 BY ${sourceKeySql}
    ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
      AND dimensions = {embeddingDimensions:UInt32}
      AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
      AND environment != {publicLlmJudgeEnvironment:String}`;
}

/** Returns aggregate admission estimates; summary payloads stay in ClickHouse. */
export async function getTopicClusteringSummaryStats(
  projectId: string,
  facetId: string,
  facetVersion: number,
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
  limits: { maxRows: number; maxBytes: number },
): Promise<{ count: number; bytes: number }> {
  const [{ count }] = await getTopicSummaryCounts(
    projectId,
    [{ facetId, version: facetVersion }],
    embeddingConfig,
    timeRange,
  );
  const vectorBytes = count * embeddingConfig.embeddingDimensions * 8;
  // Narrow oversized windows using metadata before inspecting their text payloads.
  if (!count || count > limits.maxRows || vectorBytes > limits.maxBytes)
    return { count, bytes: vectorBytes };
  // UTF-8 JSON bytes bound UTF-16 code units, including escaping and map keys.
  // Allow for field names and row overhead; this is not a total RSS estimate.
  const estimatedBytesSql = `length(embedding) * 8 + 2 * length(toJSONString(tuple(
    project_id, facet_id, facet_version, trace_id, session_id, trigger_type,
    environment, trace_name, toUnixTimestamp64Milli(unit_start_time),
    processing_state, summary, transcript_id, transcript_version, summary_model,
    embedding_model, provided_usage_details, usage_details,
    provided_cost_details, cost_details, toUnixTimestamp64Milli(processed_at), metadata
  ))) + 2048`;
  const [row] = await queryClickhouse<{ count: string; bytes: string }>({
    query: clusteringSummariesSql(
      "count() AS count, sum(estimated_bytes) AS bytes",
      `processing_state, embedding_model, environment, ${estimatedBytesSql} AS estimated_bytes`,
    ),
    params: {
      projectId,
      facetId,
      facetVersion,
      ...embeddingConfig,
      ...timeRangeParams(timeRange),
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
    },
    tags: { route: "topics-clustering-summary-stats", projectId },
  });
  return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
}

export const TOPIC_CLUSTERING_CAPACITY_ERROR =
  "Topics clustering exceeds this worker's capacity. Choose a smaller time window; no partial cohort was used.";

export async function getTopicClusteringSummaries(
  projectId: string,
  facetId: string,
  facetVersion: number,
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
  limits: { maxRows: number; maxBytes: number },
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
      query: `${clusteringSummariesSql(summaryColumns)}
        ORDER BY trace_id LIMIT {maximumRows:UInt64}`,
      params: {
        projectId,
        facetId,
        facetVersion,
        ...embeddingConfig,
        ...timeRangeParams(timeRange),
        internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
        publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
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

export async function hasTopicEmbeddings(projectId: string): Promise<boolean> {
  const rows = await queryClickhouse<{ found: number }>({
    query: `SELECT 1 AS found FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND processing_state = 'complete'
      LIMIT 1`,
    params: { projectId },
    tags: { route: "topics-has-embeddings", projectId },
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
        AND trace_id != '' AND processing_state = 'complete'
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment != {publicLlmJudgeEnvironment:String}
      LIMIT 1`,
    params: {
      projectId,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
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

/** Approximate costs; retry inserts can overcount until background merges deduplicate them. */
export async function getTopicExecutionCosts(
  projectId: string,
  executionIds: string[],
): Promise<Record<string, number>> {
  if (executionIds.length === 0) return {};
  const rows = await queryClickhouse<{ executionId: string; cost: string }>({
    query: `SELECT JSONExtractString(metadata, 'executionId') AS executionId,
        sum(calculated_total_cost) AS cost
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND executionId IN {executionIds:Array(String)}
        AND notEmpty(cost_details)
      GROUP BY executionId`,
    params: { projectId, executionIds },
    tags: { route: "topics-execution-costs", projectId },
  }).catch((error: unknown) => {
    traceException(error);
    logger.warn("Failed to estimate Topics execution costs", {
      projectId,
      error,
    });
    return [];
  });
  return Object.fromEntries(
    rows.map((row) => [row.executionId, Number(row.cost)]),
  );
}

/** Count current compatible summaries without loading summary text or vectors. */
export async function getTopicSummaryCounts(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
  timeRange: TopicTimeRange,
): Promise<{ facetId: string; facetVersion: number; count: number }[]> {
  if (!facets.length) return [];
  const scopeSql = `trace_id != ''
    AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})`;
  const rows = await queryClickhouse<{
    facetId: string;
    facetVersion: number;
    count: string;
  }>({
    query: `SELECT facet_id AS facetId, facet_version AS facetVersion, count() AS count FROM (
      SELECT facet_id, facet_version, processing_state, embedding_model, length(embedding) AS dimensions, environment
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
        AND ${latestSummaryFilterSql(scopeSql)}
      ORDER BY processed_at DESC
      LIMIT 1 BY ${sourceKeySql}
    ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
      AND dimensions = {embeddingDimensions:UInt32}
      AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
      AND environment != {publicLlmJudgeEnvironment:String}
    GROUP BY facet_id, facet_version`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetIds: facets.map(({ facetId }) => facetId),
      facetVersions: facets.map(({ version }) => version),
      ...embeddingConfig,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
    },
    tags: { route: "topics-summary-counts", projectId },
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

/** writeTopicSummaries rejects the whole insert if any row fails this check. */
export function isValidTopicSummary(row: TopicSummary): boolean {
  return (
    topicSourceSchema.safeParse(row).success &&
    typeof row.environment === "string" &&
    row.embedding.every(Number.isFinite) &&
    !(row.state === "complete" && row.embedding.length === 0) &&
    row.state !== "summarized"
  );
}

export async function writeTopicSummaries(rows: TopicSummary[]): Promise<void> {
  if (!rows.length) return;
  if (!rows.every(isValidTopicSummary))
    throw new Error("Invalid Topics summary result.");
  await insertTopicRows("topic_facet_summaries", rows, (row) => ({
    project_id: row.projectId,
    facet_id: row.facetId,
    facet_version: row.facetVersion,
    trace_id: row.traceId ?? "",
    session_id: row.sessionId ?? "",
    trigger_type: row.triggerType,
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
    summary_model: row.summaryModel,
    embedding_model: row.embeddingModel,
    provided_usage_details: row.providedUsageDetails,
    usage_details: row.usageDetails,
    provided_cost_details: row.providedCostDetails,
    cost_details: row.costDetails,
    processed_at: convertDateToClickhouseDateTime(new Date(row.processedAt)),
    metadata: JSON.stringify(row.metadata),
  }));
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
  await insertTopicRows("topic_assignments", rows, (row) => ({
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
    topic_id: row.topicId ?? "",
    topic_version_id: row.topicVersionId ?? "",
    distance: row.distance,
    runner_up_distance: row.runnerUpDistance,
    origin: row.origin,
    coordinates: row.coordinates ?? [],
    assigned_at: convertDateToClickhouseDateTime(new Date(row.assignedAt)),
  }));
}

const assignmentColumns = `project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId,
      session_id AS sessionId,
      environment, trace_name AS traceName,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      coordinates,
      toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
      clustering_run_id AS runId,
      topic_id AS topicId, topic_version_id AS topicVersionId, distance,
      runner_up_distance AS runnerUpDistance, origin,
      toUnixTimestamp64Milli(assigned_at) AS assignedAtMs`;
type AssignmentRow = Omit<
  TopicAssignment,
  | "unitStartTime"
  | "assignedAt"
  | "summaryProcessedAt"
  | "runId"
  | "coordinates"
> & {
  unitStartTimeMs: string;
  summaryProcessedAtMs: string;
  assignedAtMs: string;
  runId: string;
  coordinates: number[];
};
function assignmentResult({
  unitStartTimeMs,
  summaryProcessedAtMs,
  assignedAtMs,
  ...row
}: AssignmentRow): TopicAssignment {
  return {
    ...row,
    ...topicSourceSchema.parse({
      traceId: row.traceId || null,
      sessionId: row.sessionId || null,
    }),
    runId: row.runId || null,
    topicId: row.topicId || null,
    topicVersionId: row.topicVersionId || null,
    coordinates:
      row.coordinates.length === 2
        ? [row.coordinates[0], row.coordinates[1]]
        : null,
    unitStartTime: new Date(Number(unitStartTimeMs)).toISOString(),
    summaryProcessedAt: new Date(Number(summaryProcessedAtMs)).toISOString(),
    assignedAt: new Date(Number(assignedAtMs)).toISOString(),
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
      ORDER BY assigned_at DESC
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
      ORDER BY assigned_at DESC, origin DESC
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

/** Current membership prefers the newest facet version, including ad-hoc attempts. */
export async function readLatestTopicAssignments(
  projectId: string,
  facetId: string,
  timeRange: TopicTimeRange,
  traceIds?: string[],
): Promise<TopicAssignment[]> {
  const publishedRuns = await prisma.topicClusteringRun.findMany({
    where: {
      projectId,
      facetId,
      status: "completed",
    },
    select: { id: true },
  });
  const rows = await queryClickhouse<AssignmentRow>({
    query: `SELECT ${assignmentColumns} FROM topic_assignments
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND facet_id = {facetId:String}
        AND (clustering_run_id = '' OR clustering_run_id IN ({publishedRunIds:Array(String)}))
        ${traceIds ? "AND trace_id IN {traceIds:Array(String)}" : ""}
      ORDER BY facet_version DESC, assigned_at DESC, clustering_run_id DESC, origin DESC
      LIMIT 1 BY project_id, facet_id, trace_id, if(trace_id = '', session_id, '')`,
    params: {
      projectId,
      ...timeRangeParams(timeRange),
      facetId,
      publishedRunIds: publishedRuns.map(({ id }) => id),
      ...(traceIds ? { traceIds } : {}),
    },
    tags: { route: "topics-current-assignments", projectId },
  });
  return rows.map(assignmentResult);
}
