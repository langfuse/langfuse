import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import { buildClickHouseLogComment } from "../clickhouse/queryTags";
import { queryClickhouse } from "../repositories/clickhouse";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicSummary,
} from "../../topics";
import { topicSourceSchema } from "../../topics";
import { prisma } from "../../db";
import { chunk } from "lodash";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

/** Opaque application references derived from the source key; no ID column is stored. */
export function topicSummaryId(
  row: Pick<
    TopicSummary,
    "projectId" | "facetId" | "facetVersion" | "traceId" | "sessionId"
  >,
): string {
  return createHash("sha256")
    .update(
      [
        row.projectId,
        row.facetId,
        String(row.facetVersion),
        row.traceId ? "trace" : "session",
        row.traceId ?? row.sessionId,
      ].join("\0"),
    )
    .digest("hex");
}

const summaryIdSql = `lower(hex(SHA256(concat(project_id, char(0), facet_id, char(0), toString(facet_version),
  char(0), if(trace_id != '', 'trace', 'session'), char(0),
  if(trace_id != '', trace_id, session_id)))))`;
const sourceKeySql =
  "project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')";

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
): Promise<TopicDefinition[]> {
  const definitions: TopicDefinition[] = [];
  for (const ids of chunk([...new Set(topicVersionIds)], LOOKUP_BATCH_SIZE)) {
    const rows = await queryClickhouse<
      Omit<TopicDefinition, "createdAt" | "metadata"> & {
        createdAtMs: string;
        metadataJson: string;
      }
    >({
      query: `SELECT project_id AS projectId, id AS topicVersionId,
        stable_id AS topicId, created_by_run_id AS createdByRunId,
        toUnixTimestamp64Milli(created_at) AS createdAtMs, name, description,
        centroid, radius, tags, representative_summary_ids AS representativeSummaryIds,
        metadata AS metadataJson
        FROM topics
        WHERE project_id = {projectId:String} AND id IN {ids:Array(String)}
        ORDER BY created_at DESC LIMIT 1 BY project_id, id`,
      params: { projectId, ids },
      tags: { route: "topics-definitions", projectId },
    });
    definitions.push(
      ...rows.map(({ createdAtMs, metadataJson, ...row }) => ({
        ...row,
        createdAt: new Date(Number(createdAtMs)).toISOString(),
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
  strings(row.representativeSummaryIds);
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
        representative_summary_ids, metadata) FORMAT RowBinary`,
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

const summaryColumns = `${summaryIdSql} AS id, project_id AS projectId, facet_id AS facetId,
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
function summaryResult(row: SummaryRow): TopicSummary {
  const { metadataJson, unitStartTimeMs, processedAtMs, ...rest } = row;
  return {
    ...rest,
    ...topicSourceSchema.parse({
      traceId: row.traceId || null,
      sessionId: row.sessionId || null,
    }),
    providedUsageDetails: numberMap(row.providedUsageDetails),
    usageDetails: numberMap(row.usageDetails),
    providedCostDetails: numberMap(row.providedCostDetails),
    costDetails: numberMap(row.costDetails),
    metadata: JSON.parse(metadataJson),
    unitStartTime: new Date(Number(unitStartTimeMs)).toISOString(),
    processedAt: new Date(Number(processedAtMs)).toISOString(),
  };
}

export async function listTopicSummaries(
  projectId: string,
  filter: (
    | { ids: string[]; traceIds?: never }
    | { traceIds: string[]; ids?: never }
  ) & { facetId?: string; facetVersion?: number },
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
        ${filter.facetVersion ? "AND facet_version = {facetVersion:UInt32}" : ""}
      ORDER BY processed_at DESC LIMIT 1 BY ${sourceKeySql}`,
        params: {
          projectId,
          ids,
          ...(filter.facetId ? { facetId: filter.facetId } : {}),
          ...(filter.facetVersion ? { facetVersion: filter.facetVersion } : {}),
        },
        tags: { route: "topics-summaries", projectId },
      })),
    );
  }
  rows.sort((a, b) => Number(b.processedAtMs) - Number(a.processedAtMs));
  return rows.map(summaryResult);
}
export const readTopicSummaries = (projectId: string, summaryIds: string[]) =>
  listTopicSummaries(projectId, { ids: summaryIds });

/** Without a version filter, use each source's newest processed facet version. */
export async function getLatestFacetSummaries(
  projectId: string,
  facetId: string,
  facetVersion?: number,
): Promise<TopicSummary[]> {
  const rows = await queryClickhouse<SummaryRow>({
    query: `SELECT ${summaryColumns} FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND facet_id = {facetId:String}
        ${facetVersion ? "AND facet_version = {facetVersion:UInt32}" : ""}
      ORDER BY ${facetVersion ? "" : "facet_version DESC, "}processed_at DESC
      LIMIT 1 BY ${facetVersion ? sourceKeySql : "project_id, trace_id, if(trace_id = '', session_id, '')"}`,
    params: {
      projectId,
      facetId,
      ...(facetVersion ? { facetVersion } : {}),
    },
    tags: { route: "topics-latest-summaries", projectId },
  });
  return rows.map(summaryResult);
}

export async function getTopicClusteringSummaries(
  projectId: string,
  facetId: string,
  facetVersion: number,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<TopicSummary[]> {
  const rows = await queryClickhouse<SummaryRow>({
    query: `SELECT ${summaryColumns} FROM (
      SELECT * FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND trace_id != '' AND facet_id = {facetId:String}
        AND facet_version = {facetVersion:UInt32}
      ORDER BY processed_at DESC
      LIMIT 1 BY ${sourceKeySql}
    ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
      AND length(embedding) = {embeddingDimensions:UInt32}
    ORDER BY trace_id`,
    params: { projectId, facetId, facetVersion, ...embeddingConfig },
    tags: { route: "topics-clustering-summaries", projectId },
  });
  return rows.map(summaryResult);
}

/** Count current compatible summaries without loading summary text or vectors. */
export async function getTopicSummaryCounts(
  projectId: string,
  facets: TopicFacetRef[],
  embeddingConfig: TopicEmbeddingConfig,
): Promise<{ facetId: string; facetVersion: number; count: number }[]> {
  if (!facets.length) return [];
  const rows = await queryClickhouse<{
    facetId: string;
    facetVersion: number;
    count: string;
  }>({
    query: `SELECT facet_id AS facetId, facet_version AS facetVersion, count() AS count FROM (
      SELECT facet_id, facet_version, processing_state, embedding_model, length(embedding) AS dimensions
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND trace_id != ''
        AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
      ORDER BY processed_at DESC
      LIMIT 1 BY ${sourceKeySql}
    ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
      AND dimensions = {embeddingDimensions:UInt32}
    GROUP BY facet_id, facet_version`,
    params: {
      projectId,
      facetIds: facets.map(({ facetId }) => facetId),
      facetVersions: facets.map(({ version }) => version),
      ...embeddingConfig,
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

export async function writeTopicSummaries(rows: TopicSummary[]): Promise<void> {
  if (!rows.length) return;
  for (const row of rows) {
    if (
      !topicSourceSchema.safeParse(row).success ||
      !row.embedding.every(Number.isFinite) ||
      (row.state === "complete" && !row.embedding.length) ||
      row.state === "summarized"
    )
      throw new Error("Invalid Topics summary result.");
  }
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
      ${summaryIdSql} AS summaryId, coordinates,
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
export async function readTopicRunSummaryIds(
  projectId: string,
  runId: string,
): Promise<string[]> {
  const rows = await queryClickhouse<{ summaryId: string }>({
    query: `SELECT DISTINCT ${summaryIdSql} AS summaryId FROM topic_assignments
      WHERE project_id = {projectId:String} AND clustering_run_id = {runId:String}
        AND origin = 'initial'
        AND trace_id != ''
      ORDER BY summaryId`,
    params: { projectId, runId },
    tags: { route: "topics-run-summaries", projectId },
  });
  return rows.map((row) => row.summaryId);
}

/** Initial membership includes rows with missing coordinates, excluding online assignments. */
export async function readTopicMapAssignments(
  projectId: string,
  runId: string,
): Promise<TopicAssignment[]> {
  const rows = await queryClickhouse<AssignmentRow>({
    query: `SELECT ${assignmentColumns} FROM topic_assignments
      WHERE project_id = {projectId:String}
        AND clustering_run_id = {runId:String}
        AND origin = 'initial' AND trace_id != ''
      ORDER BY assigned_at DESC
      LIMIT 1 BY ${sourceKeySql}`,
    params: { projectId, runId },
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
        AND clustering_run_id = {runId:String} AND summaryId IN ({summaryIds:Array(String)})
      ORDER BY assigned_at DESC, origin DESC
      LIMIT 1 BY ${sourceKeySql}`,
        params: { projectId, summaryIds: batch, runId },
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
      WHERE project_id = {projectId:String} AND facet_id = {facetId:String}
        AND (clustering_run_id = '' OR clustering_run_id IN ({publishedRunIds:Array(String)}))
      ORDER BY facet_version DESC, assigned_at DESC, clustering_run_id DESC, origin DESC
      LIMIT 1 BY project_id, facet_id, trace_id, if(trace_id = '', session_id, '')`,
    params: {
      projectId,
      facetId,
      publishedRunIds: publishedRuns.map(({ id }) => id),
    },
    tags: { route: "topics-current-assignments", projectId },
  });
  return rows.map(assignmentResult);
}
