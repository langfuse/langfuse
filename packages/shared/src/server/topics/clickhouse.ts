import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import { buildClickHouseLogComment } from "../clickhouse/queryTags";
import { queryClickhouse } from "../repositories/clickhouse";
import type {
  TopicAssignment,
  TopicEmbeddingConfig,
  TopicSummary,
} from "../../topics";
import { topicSourceSchema } from "../../topics";
import { prisma } from "../../db";
import { chunk } from "lodash";

const LOOKUP_BATCH_SIZE = 1000;
const INSERT_BATCH_SIZE = 10_000;
const INSERT_BATCH_BYTES = 8 * 1024 * 1024;

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
          route:
            table === "topic_facet_summaries"
              ? "topics-summaries"
              : "topics-assignments",
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

const summaryColumns = `id, project_id AS projectId, facet_id AS facetId,
  facet_version_id AS facetVersionId, facet_version AS facetVersion,
  trace_id AS traceId, session_id AS sessionId, trigger_type AS triggerType,
  toUnixTimestamp64Milli(unit_start_time) AS traceTimestampMs,
  toString(revision) AS revision, execution_id AS executionId,
  result_version AS resultVersion, processing_state AS state, summary, embedding,
  input_hash AS inputHash, invocation_hash AS invocationHash,
  summary_model AS summaryModel, embedding_model AS embeddingModel,
  input_tokens AS inputTokens, output_tokens AS outputTokens, embedding_tokens AS embeddingTokens,
  summary_cost_usd AS summaryCostUsd, embedding_cost_usd AS embeddingCostUsd,
  toUnixTimestamp64Milli(processed_at) AS processedAtMs, metadata AS metadataJson`;

type SummaryRow = Omit<
  TopicSummary,
  "metadata" | "traceTimestamp" | "processedAt"
> & { metadataJson: string; traceTimestampMs: string; processedAtMs: string };
function summaryResult(row: SummaryRow): TopicSummary {
  const { metadataJson, traceTimestampMs, processedAtMs, ...rest } = row;
  return {
    ...rest,
    ...topicSourceSchema.parse({
      traceId: row.traceId || null,
      sessionId: row.sessionId || null,
    }),
    summaryCostUsd: Number(row.summaryCostUsd),
    embeddingCostUsd: Number(row.embeddingCostUsd),
    metadata: JSON.parse(metadataJson),
    traceTimestamp: new Date(Number(traceTimestampMs)).toISOString(),
    processedAt: new Date(Number(processedAtMs)).toISOString(),
  };
}

export async function listTopicSummaries(
  projectId: string,
  filter:
    | { ids: string[]; traceIds?: never; facetId?: never }
    | { traceIds: string[]; facetId?: string; ids?: never },
): Promise<TopicSummary[]> {
  const rows: SummaryRow[] = [];
  for (const ids of chunk(
    [...new Set(filter.ids ?? filter.traceIds)],
    LOOKUP_BATCH_SIZE,
  )) {
    rows.push(
      ...(await queryClickhouse<SummaryRow>({
        query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND ${filter.ids ? "id" : "trace_id"} IN ({ids:Array(String)})
        ${filter.facetId ? "AND facet_id = {facetId:String}" : ""}
      ORDER BY toUInt64(revision) DESC, result_version DESC LIMIT 1 BY project_id, id`,
        params: {
          projectId,
          ids,
          ...(filter.facetId ? { facetId: filter.facetId } : {}),
        },
        tags: { route: "topics-summaries", projectId },
      })),
    );
  }
  rows.sort((a, b) => {
    if (BigInt(a.revision) === BigInt(b.revision))
      return b.resultVersion - a.resultVersion;
    return BigInt(a.revision) > BigInt(b.revision) ? -1 : 1;
  });
  return rows.map(summaryResult);
}
export const readTopicSummaries = (projectId: string, summaryIds: string[]) =>
  listTopicSummaries(projectId, { ids: summaryIds });

export async function getLatestFacetSummaries(
  projectId: string,
  facetId: string,
  facetVersionId: string,
): Promise<TopicSummary[]> {
  const rows = await queryClickhouse<SummaryRow>({
    query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND facet_id = {facetId:String}
        AND facet_version_id = {facetVersionId:String}
      ORDER BY toUInt64(revision) DESC, processedAtMs DESC, id DESC
      LIMIT 1 BY projectId, facetId, traceId, sessionId`,
    params: { projectId, facetId, facetVersionId },
    tags: { route: "topics-latest-summaries", projectId },
  });
  return rows.map(summaryResult);
}

export async function getTopicClusteringSummaryIds(
  projectId: string,
  facetId: string,
  facetVersionId: string,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<string[]> {
  const rows = await queryClickhouse<{ id: string }>({
    query: `SELECT id FROM (
      SELECT id, trace_id, session_id, processing_state, embedding_model, length(embedding) AS dimensions
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND trace_id != '' AND facet_id = {facetId:String}
        AND facet_version_id = {facetVersionId:String}
      ORDER BY revision DESC, result_version DESC, processed_at DESC, id DESC
      LIMIT 1 BY project_id, facet_id, trace_id, session_id
    ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
      AND dimensions = {embeddingDimensions:UInt32}
    ORDER BY trace_id, session_id, id`,
    params: { projectId, facetId, facetVersionId, ...embeddingConfig },
    tags: { route: "topics-clustering-summaries", projectId },
  });
  return rows.map((row) => row.id);
}

/** Count current compatible summaries without loading summary text or vectors. */
export async function getTopicSummaryCounts(
  projectId: string,
  facetVersionIds: string[],
  embeddingConfig: TopicEmbeddingConfig,
): Promise<Record<string, number>> {
  if (!facetVersionIds.length) return {};
  const rows = await queryClickhouse<{ facetVersionId: string; count: string }>(
    {
      query: `SELECT facet_version_id AS facetVersionId, count() AS count FROM (
      SELECT facet_version_id, processing_state, embedding_model, length(embedding) AS dimensions
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND trace_id != ''
        AND facet_version_id IN ({facetVersionIds:Array(String)})
      ORDER BY revision DESC, result_version DESC, processed_at DESC, id DESC
      LIMIT 1 BY project_id, facet_version_id, trace_id, session_id
    ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
      AND dimensions = {embeddingDimensions:UInt32}
    GROUP BY facet_version_id`,
      params: { projectId, facetVersionIds, ...embeddingConfig },
      tags: { route: "topics-summary-counts", projectId },
    },
  );
  return Object.fromEntries(
    facetVersionIds.map((id) => [
      id,
      Number(rows.find((row) => row.facetVersionId === id)?.count ?? 0),
    ]),
  );
}

export async function writeTopicSummaries(rows: TopicSummary[]): Promise<void> {
  if (!rows.length) return;
  for (const row of rows) {
    if (
      !topicSourceSchema.safeParse(row).success ||
      !row.embedding.every(Number.isFinite) ||
      (row.state === "complete" && !row.embedding.length) ||
      row.resultVersion !== 2 ||
      row.state === "summarized"
    )
      throw new Error("Invalid Topics summary result.");
  }
  await insertTopicRows("topic_facet_summaries", rows, (row) => ({
    id: row.id,
    project_id: row.projectId,
    facet_id: row.facetId,
    facet_version_id: row.facetVersionId,
    facet_version: row.facetVersion,
    trace_id: row.traceId ?? "",
    session_id: row.sessionId ?? "",
    trigger_type: "manual_poc",
    unit_start_time: convertDateToClickhouseDateTime(
      new Date(row.traceTimestamp),
    ),
    revision: row.revision,
    execution_id: row.executionId,
    result_version: row.resultVersion,
    processing_state: row.state,
    summary: row.summary,
    embedding: row.embedding,
    input_hash: row.inputHash,
    invocation_hash: row.invocationHash,
    summary_model: row.summaryModel,
    embedding_model: row.embeddingModel,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    embedding_tokens: row.embeddingTokens,
    summary_cost_usd: row.summaryCostUsd,
    embedding_cost_usd: row.embeddingCostUsd,
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
      !row.executionId ||
      (row.outcome === "assigned" && (!row.topicId || !row.topicVersionId)) ||
      (row.outcome !== "assigned" && (row.topicId || row.topicVersionId)) ||
      ((row.outcome === "assigned" || row.outcome === "outlier") &&
        (!row.runId || !row.runSequence)) ||
      (row.outcome === "awaiting_topics" && row.runId !== null) ||
      (row.runId === null) !== (row.runSequence === null) ||
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
    id: row.id,
    project_id: row.projectId,
    facet_id: row.facetId,
    facet_version_id: row.facetVersionId,
    facet_version: row.facetVersion,
    trace_id: row.traceId ?? "",
    session_id: row.sessionId ?? "",
    unit_start_time: convertDateToClickhouseDateTime(
      new Date(row.traceTimestamp),
    ),
    facet_summary_id: row.summaryId,
    execution_id: row.executionId,
    summary_revision: row.summaryRevision,
    clustering_run_id: row.runId ?? "",
    run_sequence: row.runSequence ?? "0",
    topic_id: row.topicId ?? "",
    topic_version_id: row.topicVersionId ?? "",
    outcome: row.outcome,
    distance: row.distance,
    runner_up_distance: row.runnerUpDistance,
    rejection_reason: row.rejectionReason,
    origin: row.origin,
    coordinates: row.coordinates ?? [],
    assigned_at: convertDateToClickhouseDateTime(new Date(row.assignedAt)),
    result_version: 1,
  }));
}

const assignmentColumns = `id, project_id AS projectId, facet_id AS facetId,
      facet_version_id AS facetVersionId, facet_version AS facetVersion, trace_id AS traceId,
      session_id AS sessionId,
      toUnixTimestamp64Milli(unit_start_time) AS traceTimestampMs,
      facet_summary_id AS summaryId, execution_id AS executionId, coordinates,
      toString(summary_revision) AS summaryRevision,
      clustering_run_id AS runId, toString(run_sequence) AS runSequence,
      topic_id AS topicId, topic_version_id AS topicVersionId, outcome, distance,
      runner_up_distance AS runnerUpDistance, rejection_reason AS rejectionReason, origin,
      toUnixTimestamp64Milli(assigned_at) AS assignedAtMs`;
type AssignmentRow = Omit<
  TopicAssignment,
  "traceTimestamp" | "assignedAt" | "runId" | "runSequence" | "coordinates"
> & {
  traceTimestampMs: string;
  assignedAtMs: string;
  runId: string;
  runSequence: string;
  coordinates: number[];
};
function assignmentResult({
  traceTimestampMs,
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
    runSequence: row.runSequence === "0" ? null : row.runSequence,
    topicId: row.topicId || null,
    topicVersionId: row.topicVersionId || null,
    coordinates:
      row.coordinates.length === 2
        ? [row.coordinates[0], row.coordinates[1]]
        : null,
    traceTimestamp: new Date(Number(traceTimestampMs)).toISOString(),
    assignedAt: new Date(Number(assignedAtMs)).toISOString(),
  };
}

/** Assignments record this execution's membership, including reused summaries. */
export async function readTopicExecutionSummaryIds(
  projectId: string,
  executionId: string,
): Promise<{ facetVersionId: string; summaryId: string }[]> {
  return queryClickhouse<{ facetVersionId: string; summaryId: string }>({
    query: `SELECT DISTINCT facet_version_id AS facetVersionId,
        facet_summary_id AS summaryId FROM topic_assignments
      WHERE project_id = {projectId:String} AND execution_id = {executionId:String}
        AND trace_id != ''
      ORDER BY facetVersionId, summaryId`,
    params: { projectId, executionId },
    tags: { route: "topics-execution-summaries", projectId },
  });
}

/** A published map's cohort excludes later online assignments to the same map. */
export async function readTopicRunSummaryIds(
  projectId: string,
  runId: string,
  executionId: string,
): Promise<string[]> {
  const rows = await queryClickhouse<{ summaryId: string }>({
    query: `SELECT DISTINCT facet_summary_id AS summaryId FROM topic_assignments
      WHERE project_id = {projectId:String} AND clustering_run_id = {runId:String}
        AND execution_id = {executionId:String} AND origin = 'initial'
        AND trace_id != ''
      ORDER BY summaryId`,
    params: { projectId, runId, executionId },
    tags: { route: "topics-run-summaries", projectId },
  });
  return rows.map((row) => row.summaryId);
}

/** Discovery coordinates belong to their originating execution, even after later assignments. */
export async function readTopicMapAssignments(
  projectId: string,
  runId: string,
  executionId: string,
): Promise<TopicAssignment[]> {
  const rows = await queryClickhouse<AssignmentRow>({
    query: `SELECT ${assignmentColumns} FROM topic_assignments
      WHERE project_id = {projectId:String}
        AND clustering_run_id = {runId:String} AND execution_id = {executionId:String}
        AND origin = 'initial' AND length(coordinates) = 2
      ORDER BY assigned_at DESC, id DESC, result_version DESC
      LIMIT 1 BY project_id, clustering_run_id, facet_summary_id`,
    params: { projectId, runId, executionId },
    tags: { route: "topics-map", projectId },
  });
  return rows.map(assignmentResult);
}

export async function readTopicAssignments(
  projectId: string,
  summaryIds: string[],
  runId: string,
): Promise<TopicAssignment[]> {
  if (!summaryIds.length) return [];
  const rows: AssignmentRow[] = [];
  for (const batch of chunk([...new Set(summaryIds)], LOOKUP_BATCH_SIZE)) {
    rows.push(
      ...(await queryClickhouse<AssignmentRow>({
        query: `SELECT ${assignmentColumns}
      FROM topic_assignments WHERE project_id = {projectId:String}
        AND clustering_run_id = {runId:String} AND facet_summary_id IN ({summaryIds:Array(String)})
      ORDER BY assigned_at DESC, id DESC, result_version DESC
      LIMIT 1 BY project_id, clustering_run_id, facet_summary_id`,
        params: { projectId, summaryIds: batch, runId },
        tags: { route: "topics-assignments", projectId },
      })),
    );
  }
  return rows.map(assignmentResult);
}

/** Current membership includes published assignments and explicit no-topic results. */
export async function readLatestTopicAssignments(
  projectId: string,
  facetId: string,
): Promise<TopicAssignment[]> {
  const publishedRuns = await prisma.topicClusteringRun.findMany({
    where: {
      projectId,
      facetVersion: { facetId },
      status: "completed",
      publishedAt: { not: null },
    },
    select: { id: true },
  });
  const rows = await queryClickhouse<AssignmentRow>({
    query: `SELECT ${assignmentColumns} FROM topic_assignments
      WHERE project_id = {projectId:String} AND facet_id = {facetId:String}
        AND (clustering_run_id = '' OR clustering_run_id IN ({publishedRunIds:Array(String)}))
      ORDER BY assigned_at DESC, id DESC, result_version DESC
      LIMIT 1 BY project_id, facet_id, trace_id, session_id`,
    params: {
      projectId,
      facetId,
      publishedRunIds: publishedRuns.map(({ id }) => id),
    },
    tags: { route: "topics-current-assignments", projectId },
  });
  return rows.map(assignmentResult);
}
