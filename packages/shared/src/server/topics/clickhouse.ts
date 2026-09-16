import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import { buildClickHouseLogComment } from "../clickhouse/queryTags";
import { queryClickhouse } from "../repositories/clickhouse";
import type { TopicAssignment, TopicSummary } from "../../topics";

const summaryColumns = `id, project_id AS projectId, facet_id AS facetId,
  facet_version_id AS facetVersionId, facet_version AS facetVersion,
  unit_id AS traceId, unit_type AS unitType, trigger_type AS triggerType,
  toUnixTimestamp64Milli(unit_timestamp) AS traceTimestampMs,
  toString(revision) AS revision, execution_id AS executionId,
  result_version AS resultVersion, processing_state AS state, summary, embedding,
  input_hash AS inputHash, snapshot_hash AS snapshotHash, invocation_hash AS invocationHash,
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
    summaryCostUsd: Number(row.summaryCostUsd),
    embeddingCostUsd: Number(row.embeddingCostUsd),
    metadata: JSON.parse(metadataJson),
    traceTimestamp: new Date(Number(traceTimestampMs)).toISOString(),
    processedAt: new Date(Number(processedAtMs)).toISOString(),
  };
}

export async function listTopicSummaries(
  projectId: string,
  filter: {
    ids?: string[];
    facetId?: string;
    facetVersionId?: string;
    traceIds?: string[];
  },
): Promise<TopicSummary[]> {
  if (filter.ids?.length === 0 || filter.traceIds?.length === 0) return [];
  if (!filter.ids?.length && !filter.traceIds?.length)
    throw new Error("Topics summary reads require an explicit bounded cohort.");
  if (
    (filter.ids?.length ?? 0) > 20000 ||
    (filter.traceIds?.length ?? 0) > 1000
  )
    throw new Error("Topics summary cohort exceeds the local limit.");
  const rows = await queryClickhouse<SummaryRow>({
    query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
      ${filter.ids ? "AND id IN ({ids:Array(String)})" : ""}
      ${filter.facetId ? "AND facet_id = {facetId:String}" : ""}
      ${filter.facetVersionId ? "AND facet_version_id = {facetVersionId:String}" : ""}
      ${filter.traceIds ? "AND unit_id IN ({traceIds:Array(String)})" : ""}
      ORDER BY revision DESC, result_version DESC LIMIT 1 BY project_id, id`,
    params: { projectId, ...filter },
    tags: { route: "topics-summaries", projectId },
  });
  return rows.map(summaryResult);
}
export const readTopicSummaries = (projectId: string, summaryIds: string[]) =>
  listTopicSummaries(projectId, { ids: summaryIds });

export async function findCachedTopicSummary(
  projectId: string,
  filter: {
    traceId: string;
    facetVersionId: string;
    inputHash: string;
    invocationHash: string;
  },
): Promise<TopicSummary | null> {
  const rows = await queryClickhouse<SummaryRow>({
    query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_id = {traceId:String}
        AND facet_version_id = {facetVersionId:String} AND input_hash = {inputHash:String}
        AND invocation_hash = {invocationHash:String}
      ORDER BY revision DESC, result_version DESC LIMIT 1`,
    params: { projectId, ...filter },
    tags: { route: "topics-summary-cache", projectId },
  });
  return rows[0] ? summaryResult(rows[0]) : null;
}

export async function writeTopicSummaries(rows: TopicSummary[]): Promise<void> {
  if (!rows.length) return;
  for (const row of rows) {
    if (
      !row.embedding.every(Number.isFinite) ||
      (row.state === "complete" && !row.embedding.length) ||
      (row.resultVersion === 1 && row.state !== "summarized") ||
      (row.resultVersion === 2 && row.state === "summarized")
    )
      throw new Error("Invalid Topics summary checkpoint.");
  }
  await clickhouseClient().insert({
    table: "topic_facet_summaries",
    format: "JSONEachRow",
    values: rows.map((row) => ({
      id: row.id,
      project_id: row.projectId,
      facet_id: row.facetId,
      facet_version_id: row.facetVersionId,
      facet_version: row.facetVersion,
      unit_id: row.traceId,
      unit_type: "trace",
      trigger_type: "manual_poc",
      unit_timestamp: convertDateToClickhouseDateTime(
        new Date(row.traceTimestamp),
      ),
      revision: row.revision,
      execution_id: row.executionId,
      result_version: row.resultVersion,
      processing_state: row.state,
      summary: row.summary,
      embedding: row.embedding,
      input_hash: row.inputHash,
      snapshot_hash: row.snapshotHash,
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
    })),
    clickhouse_settings: {
      log_comment: buildClickHouseLogComment({
        surface: "worker",
        route: "topics-summaries",
        projectId: rows[0].projectId,
      }),
    },
  });
}

export async function writeTopicAssignments(
  rows: TopicAssignment[],
): Promise<void> {
  if (!rows.length) return;
  for (const row of rows) {
    if (
      (row.outcome === "assigned" && (!row.topicId || !row.topicVersionId)) ||
      (row.outcome === "outlier" && (row.topicId || row.topicVersionId)) ||
      (row.distance !== null && !Number.isFinite(row.distance))
    )
      throw new Error("Invalid Topics assignment.");
  }
  await clickhouseClient().insert({
    table: "topic_assignments",
    format: "JSONEachRow",
    values: rows.map((row) => ({
      id: row.id,
      project_id: row.projectId,
      facet_id: row.facetId,
      facet_version_id: row.facetVersionId,
      facet_version: row.facetVersion,
      unit_id: row.traceId,
      unit_timestamp: convertDateToClickhouseDateTime(
        new Date(row.traceTimestamp),
      ),
      facet_summary_id: row.summaryId,
      summary_revision: row.summaryRevision,
      clustering_run_id: row.runId,
      run_sequence: row.runSequence,
      topic_id: row.topicId ?? "",
      topic_version_id: row.topicVersionId ?? "",
      outcome: row.outcome,
      distance: row.distance,
      runner_up_distance: row.runnerUpDistance,
      rejection_reason: row.rejectionReason,
      origin: row.origin,
      assigned_at: convertDateToClickhouseDateTime(new Date(row.assignedAt)),
      result_version: 1,
    })),
    clickhouse_settings: {
      log_comment: buildClickHouseLogComment({
        surface: "worker",
        route: "topics-assignments",
        projectId: rows[0].projectId,
      }),
    },
  });
}

export async function readTopicAssignments(
  projectId: string,
  summaryIds: string[],
  runId: string,
): Promise<TopicAssignment[]> {
  if (!summaryIds.length) return [];
  if (summaryIds.length > 20000)
    throw new Error("Topics assignment cohort exceeds the local limit.");
  const rows = await queryClickhouse<
    Omit<TopicAssignment, "traceTimestamp" | "assignedAt"> & {
      traceTimestampMs: string;
      assignedAtMs: string;
    }
  >({
    query: `SELECT id, project_id AS projectId, facet_id AS facetId,
      facet_version_id AS facetVersionId, facet_version AS facetVersion, unit_id AS traceId,
      toUnixTimestamp64Milli(unit_timestamp) AS traceTimestampMs,
      facet_summary_id AS summaryId, toString(summary_revision) AS summaryRevision,
      clustering_run_id AS runId, toString(run_sequence) AS runSequence,
      topic_id AS topicId, topic_version_id AS topicVersionId, outcome, distance,
      runner_up_distance AS runnerUpDistance, rejection_reason AS rejectionReason, origin,
      toUnixTimestamp64Milli(assigned_at) AS assignedAtMs
      FROM topic_assignments WHERE project_id = {projectId:String}
        AND clustering_run_id = {runId:String} AND facet_summary_id IN ({summaryIds:Array(String)})
      ORDER BY result_version DESC LIMIT 1 BY project_id, id`,
    params: { projectId, summaryIds, runId },
    tags: { route: "topics-assignments", projectId },
  });
  return rows.map(({ traceTimestampMs, assignedAtMs, ...row }) => ({
    ...row,
    topicId: row.topicId || null,
    topicVersionId: row.topicVersionId || null,
    traceTimestamp: new Date(Number(traceTimestampMs)).toISOString(),
    assignedAt: new Date(Number(assignedAtMs)).toISOString(),
  }));
}
