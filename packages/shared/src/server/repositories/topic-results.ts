import { prisma } from "../../db";
import type { TopicTimeRange } from "../../topics";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
} from "../llm/isInternalEvalEnvironment";
import {
  latestSummaryFilterSql,
  summarySourceKeySql,
  timeRangeParams,
  unitTimeFilterSql,
} from "../topics/clickhouse";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";

export const TOPIC_SUMMARY_STATES = [
  "complete",
  "not_applicable",
  "insufficient_input",
] as const;
export type TopicSummaryState = (typeof TOPIC_SUMMARY_STATES)[number];

export const TOPIC_ASSIGNMENT_STATUSES = [
  "assigned",
  "outlier",
  "awaiting_map",
] as const;
export type TopicAssignmentStatus = (typeof TOPIC_ASSIGNMENT_STATUSES)[number];

const TOPIC_SUMMARY_PREVIEW_LENGTH = 500;

type OptionsMatch = { operator: "any of" | "none of"; values: string[] };
type DateMatch = { operator: ">" | "<" | ">=" | "<="; value: Date };

/** Conditions on current results; text matches are case-insensitive, ids match exactly. */
export type TopicResultCondition =
  | { column: "traceId" | "environment"; match: OptionsMatch }
  | { column: "timestamp" | "processedAt"; match: DateMatch }
  | {
      column: "state";
      match: { operator: "any of" | "none of"; values: TopicSummaryState[] };
    }
  | { column: "topicId"; match: OptionsMatch }
  | {
      column: "assignmentStatus";
      match: { operator: "any of"; values: TopicAssignmentStatus[] };
    };

export type TopicResultCursor = {
  timestamp: Date;
  traceId: string;
  facetId: string;
};

export type TopicSummaryRow = {
  traceId: string;
  facetId: string;
  facetVersion: number;
  traceName: string;
  environment: string;
  timestamp: Date;
  state: TopicSummaryState;
  summary: string;
  summaryTruncated: boolean;
  processedAt: Date;
};

export type TopicAssignmentRow = {
  traceId: string;
  facetId: string;
  facetVersion: number;
  timestamp: Date;
  status: Exclude<TopicAssignmentStatus, "awaiting_map">;
  topicId: string | null;
  topicVersionId: string | null;
  runId: string | null;
  assignedAt: Date;
};

class SqlParams {
  private count = 0;
  readonly values: Record<string, unknown> = {};
  add(type: string, value: unknown) {
    const name = `p${this.count++}`;
    this.values[name] = value;
    return `{${name}:${type}}`;
  }
}

const inSql = (
  expression: string,
  match: { operator: "any of" | "none of"; values: string[] },
  params: SqlParams,
) =>
  `${expression} ${match.operator === "none of" ? "NOT IN" : "IN"} ${params.add("Array(String)", match.values)}`;

const dateSql = (expression: string, match: DateMatch, params: SqlParams) =>
  `${expression} ${match.operator} ${params.add("DateTime64(3)", convertDateToClickhouseDateTime(match.value))}`;

/** Conditions on the summary row; they filter inside `summaries`. */
function summaryConditionSql(
  condition: TopicResultCondition,
  params: SqlParams,
) {
  switch (condition.column) {
    case "traceId":
      return inSql("trace_id", condition.match, params);
    case "environment":
      return inSql("environment", condition.match, params);
    case "timestamp":
      return dateSql("unit_start_time", condition.match, params);
    case "processedAt":
      return dateSql("processed_at", condition.match, params);
    case "state":
      return inSql("toString(processing_state)", condition.match, params);
    default:
      return null;
  }
}

/** Conditions on the resolved assignment; they filter `current`. */
function assignmentConditionSql(
  condition: TopicResultCondition,
  params: SqlParams,
) {
  switch (condition.column) {
    case "topicId": {
      const matches = `(topic_status = 'assigned' AND topic_id IN ${params.add("Array(String)", condition.match.values)})`;
      return condition.match.operator === "none of"
        ? `NOT ${matches}`
        : matches;
    }
    case "assignmentStatus":
      return inSql("topic_status", condition.match, params);
    default:
      return null;
  }
}

/**
 * `summaries`: one row per trace and facet, the newest facet version's newest
 * summary. `current` adds the assignment only when it was made for exactly
 * that summary by a completed run (or online). Mirrors `resolveTopicResult`.
 */
function currentResultsSql(
  summaryConditions: string[],
  traceIdConditions: string[],
) {
  const scopeSql = `trace_id != '' AND facet_id IN {facetIds:Array(String)}`;
  const and = (conditions: string[]) =>
    conditions.map((sql) => `AND ${sql}`).join(" ");
  const latestScopeSql = [scopeSql, ...traceIdConditions].join(" AND ");
  return `
  summaries AS (
    SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at,
      processing_state, summary, trace_name, environment
    FROM topic_facet_summaries
    WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
      AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
      AND environment != {publicLlmJudgeEnvironment:String}
      ${and(summaryConditions)}
      AND ${latestSummaryFilterSql(latestScopeSql, summarySourceKeySql)}
    -- The latest-summary filter leaves one version per trace and facet; this
    -- only drops not-yet-merged duplicates, so no ordering is needed.
    LIMIT 1 BY facet_id, trace_id
  ),
  assignments AS (
    SELECT trace_id AS a_trace_id, facet_id AS a_facet_id,
      facet_version AS a_facet_version, unit_start_time AS a_unit_start_time,
      summary_processed_at AS a_summary_processed_at, topic_id AS a_topic_id,
      topic_version_id AS a_topic_version_id, clustering_run_id AS a_run_id,
      assigned_at AS a_assigned_at
    FROM topic_assignments
    WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
      AND (clustering_run_id = '' OR clustering_run_id IN {publishedRunIds:Array(String)})
      ${and(traceIdConditions)}
    ORDER BY facet_version DESC, assigned_at DESC, clustering_run_id DESC, origin DESC
    LIMIT 1 BY facet_id, trace_id
  ),
  current AS (
    SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at,
      processing_state, summary, trace_name, environment,
      processing_state = 'complete' AND a_trace_id != ''
        AND a_facet_version = facet_version AND a_unit_start_time = unit_start_time
        AND a_summary_processed_at = processed_at AS matched,
      if(matched, a_topic_id, '') AS topic_id,
      if(matched, a_topic_version_id, '') AS topic_version_id,
      if(matched, a_run_id, '') AS clustering_run_id,
      a_assigned_at AS assigned_at,
      multiIf(
        processing_state != 'complete', toString(processing_state),
        NOT matched, 'awaiting_map',
        topic_id != '', 'assigned',
        'outlier'
      ) AS topic_status
    FROM summaries
    LEFT ANY JOIN assignments ON a_trace_id = trace_id AND a_facet_id = facet_id
  )`;
}

type ListInput = {
  projectId: string;
  window: TopicTimeRange;
  facetIds: string[];
  conditions: TopicResultCondition[];
  orderBy: "timestamp.desc" | "timestamp.asc";
  limit: number;
  cursor?: TopicResultCursor;
  /** Candidate rows per batch and batches per page; defaults bound the work of one page. */
  scan?: { batchSize: number; maxBatches: number };
};

const MAX_CANDIDATE_BATCHES = 10;
// Same guards as the observations v2 scan: replica reads, a request deadline,
// read-in-order without buffering, and cancellation when the client goes away.
const READ_OPTIONS = {
  preferredClickhouseService: "ReadOnly",
  clickhouseConfigs: { request_timeout: 10_000 },
  clickhouseSettings: {
    read_in_order_use_buffering: 0,
    cancel_http_readonly_queries_on_client_close: 1,
  },
} as const;

type CandidateRow = {
  facet_id: string;
  trace_id: string;
  unit_start_time: string;
};

/**
 * Picks candidates from the table that can satisfy the filter: assignments
 * when the filter needs an assignment (or rows are assignments), otherwise
 * summaries. Ordering by the sort key's minute prefix lets ClickHouse read in
 * order and stop after one batch, instead of scanning the whole window.
 */
function candidateQuery(
  input: ListInput & { kind: "summaries" | "assignments" },
  batchSize: number,
  cursor: TopicResultCursor | undefined,
  publishedRunIds: string[],
) {
  const params = new SqlParams();
  const conditions: string[] = [];
  const topicIdIn = input.conditions.find(
    (
      condition,
    ): condition is Extract<TopicResultCondition, { column: "topicId" }> =>
      condition.column === "topicId" && condition.match.operator === "any of",
  );
  const statuses = input.conditions.find(
    (
      condition,
    ): condition is Extract<
      TopicResultCondition,
      { column: "assignmentStatus" }
    > => condition.column === "assignmentStatus",
  )?.match.values;
  const fromAssignments =
    input.kind === "assignments" ||
    topicIdIn !== undefined ||
    (statuses !== undefined &&
      statuses.every((status) => status !== "awaiting_map"));
  // Trace id lookups on summaries read only columns of the latest_source_versions
  // projection, which ClickHouse serves by trace id; the resolve step applies the rest.
  const byTraceIds =
    !fromAssignments &&
    input.conditions.some(
      (condition) =>
        condition.column === "traceId" && condition.match.operator === "any of",
    );

  for (const condition of input.conditions) {
    if (condition.column === "traceId" || condition.column === "timestamp")
      conditions.push(summaryConditionSql(condition, params) as string);
    else if (byTraceIds) continue;
    else if (condition.column === "environment" || !fromAssignments) {
      const sql = summaryConditionSql(condition, params);
      if (sql) conditions.push(sql);
    }
  }
  if (fromAssignments) {
    conditions.push(
      `(clustering_run_id = '' OR clustering_run_id IN ${params.add("Array(String)", publishedRunIds)})`,
    );
    if (topicIdIn)
      conditions.push(
        `topic_id IN ${params.add("Array(String)", topicIdIn.match.values)}`,
      );
    else if (statuses?.length === 1)
      conditions.push(
        statuses[0] === "assigned" ? "topic_id != ''" : "topic_id = ''",
      );
  } else {
    conditions.push("trace_id != ''");
    // Every assignment status needs a complete summary.
    if (statuses && !byTraceIds)
      conditions.push("processing_state = 'complete'");
  }
  if (!byTraceIds)
    conditions.push(
      "NOT startsWith(environment, {internalEnvironmentPrefix:String})",
      "environment != {publicLlmJudgeEnvironment:String}",
    );
  const descending = input.orderBy === "timestamp.desc";
  if (cursor)
    conditions.push(
      `(unit_start_time, trace_id, facet_id) ${descending ? "<" : ">"} (${params.add("DateTime64(3)", convertDateToClickhouseDateTime(cursor.timestamp))}, ${params.add("String", cursor.traceId)}, ${params.add("String", cursor.facetId)})`,
    );
  const direction = descending ? "DESC" : "ASC";
  return {
    query: `SELECT facet_id, trace_id, unit_start_time
      FROM ${fromAssignments ? "topic_assignments" : "topic_facet_summaries"}
      WHERE project_id = {projectId:String} AND ${unitTimeFilterSql}
        AND facet_id IN {facetIds:Array(String)}
        AND ${conditions.join(" AND ")}
      ORDER BY ${byTraceIds ? "" : `toStartOfMinute(unit_start_time) ${direction}, `}unit_start_time ${direction},
        trace_id ${direction}, facet_id ${direction}
      LIMIT {batchSize:UInt32}`,
    params: { ...params.values, batchSize },
  };
}

/**
 * Pages current results of one row per trace and facet, ordered by the trace's
 * source time. Each batch takes candidate rows in order, then resolves the
 * current result of only those keys, so a page costs about its candidates
 * rather than the window. When the batch budget runs out before the page is
 * full, the page is returned short with a cursor to continue.
 */
async function listCurrentRows<T extends CandidateRow>(
  input: ListInput & {
    kind: "summaries" | "assignments";
    select: string;
    extraParams?: Record<string, unknown>;
  },
): Promise<{ rows: T[]; next?: TopicResultCursor }> {
  if (input.facetIds.length === 0) return { rows: [] };
  const batchSize =
    input.scan?.batchSize ?? Math.min(1000, Math.max(200, input.limit * 4));
  const maxBatches = input.scan?.maxBatches ?? MAX_CANDIDATE_BATCHES;
  const publishedRunIds = (
    await prisma.topicClusteringRun.findMany({
      where: {
        projectId: input.projectId,
        facetId: { in: input.facetIds },
        status: "completed",
      },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const baseParams = {
    projectId: input.projectId,
    facetIds: input.facetIds,
    publishedRunIds,
    internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
    publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
  };
  const tags = { route: `topics-${input.kind}`, projectId: input.projectId };
  const direction = input.orderBy === "timestamp.asc" ? "ASC" : "DESC";
  const rows: T[] = [];
  let cursor = input.cursor;

  for (let batch = 0; batch < maxBatches; batch++) {
    const candidates = candidateQuery(
      input,
      batchSize,
      cursor,
      publishedRunIds,
    );
    const found = await queryClickhouse<CandidateRow>({
      ...READ_OPTIONS,
      query: candidates.query,
      params: {
        ...baseParams,
        ...candidates.params,
        ...timeRangeParams(input.window),
      },
      tags: { ...tags, route: `${tags.route}-candidates` },
    });
    if (found.length === 0) return { rows };

    const times = found.map((row) =>
      parseClickhouseUTCDateTimeFormat(row.unit_start_time).getTime(),
    );
    const params = new SqlParams();
    const summaryConditions = input.conditions.flatMap(
      (condition) => summaryConditionSql(condition, params) ?? [],
    );
    const traceIds = params.add("Array(String)", [
      ...new Set(found.map((row) => row.trace_id)),
    ]);
    const assignmentConditions = input.conditions.flatMap(
      (condition) => assignmentConditionSql(condition, params) ?? [],
    );
    if (input.kind === "assignments")
      assignmentConditions.push("topic_status IN ('assigned', 'outlier')");
    const source =
      input.kind === "summaries" && assignmentConditions.length === 0
        ? "summaries"
        : "current";
    const candidateTuples = `arrayZip(${params.add(
      "Array(String)",
      found.map((row) => row.facet_id),
    )}, ${params.add(
      "Array(String)",
      found.map((row) => row.trace_id),
    )}, ${params.add(
      "Array(DateTime64(3))",
      found.map((row) => row.unit_start_time),
    )})`;
    const resolved = await queryClickhouse<T>({
      ...READ_OPTIONS,
      query: `WITH ${currentResultsSql(summaryConditions, [`trace_id IN ${traceIds}`])}
        SELECT ${input.select}
        FROM ${source}
        WHERE has(${candidateTuples}, (facet_id, trace_id, unit_start_time))
          ${assignmentConditions.map((sql) => `AND ${sql}`).join(" ")}
        ORDER BY unit_start_time ${direction}, trace_id ${direction}, facet_id ${direction}`,
      params: {
        ...baseParams,
        ...params.values,
        ...input.extraParams,
        // The candidates' own time span; their keys' history is read in full.
        ...timeRangeParams({
          from: new Date(Math.min(...times)),
          to: new Date(Math.max(...times) + 1),
        }),
      },
      tags,
    });
    for (const row of resolved) {
      rows.push(row);
      if (rows.length === input.limit)
        return {
          rows,
          next: {
            timestamp: parseClickhouseUTCDateTimeFormat(row.unit_start_time),
            traceId: row.trace_id,
            facetId: row.facet_id,
          },
        };
    }
    if (found.length < batchSize) return { rows };
    const last = found[found.length - 1];
    cursor = {
      timestamp: parseClickhouseUTCDateTimeFormat(last.unit_start_time),
      traceId: last.trace_id,
      facetId: last.facet_id,
    };
  }
  return { rows, next: cursor };
}

/** Lists each trace's current summary per facet. Older facet versions stay current until re-summarized. */
export async function listCurrentTopicSummaries(
  input: ListInput & { truncateSummaries: boolean },
): Promise<{ rows: TopicSummaryRow[]; next?: TopicResultCursor }> {
  const { rows, next } = await listCurrentRows<{
    trace_id: string;
    facet_id: string;
    facet_version: number;
    unit_start_time: string;
    trace_name: string;
    environment: string;
    state: TopicSummaryState;
    summary_text: string;
    summary_truncated: number;
    processed_at: string;
  }>({
    ...input,
    kind: "summaries",
    select: `trace_id, facet_id, facet_version, unit_start_time, trace_name, environment,
      toString(processing_state) AS state,
      {truncate:Bool} AND lengthUTF8(summary) > {previewLength:UInt32} AS summary_truncated,
      if({truncate:Bool}, leftUTF8(summary, {previewLength:UInt32}), summary) AS summary_text,
      processed_at`,
    extraParams: {
      truncate: input.truncateSummaries,
      previewLength: TOPIC_SUMMARY_PREVIEW_LENGTH,
    },
  });
  return {
    rows: rows.map((row) => ({
      traceId: row.trace_id,
      facetId: row.facet_id,
      facetVersion: Number(row.facet_version),
      traceName: row.trace_name,
      environment: row.environment,
      timestamp: parseClickhouseUTCDateTimeFormat(row.unit_start_time),
      state: row.state,
      summary: row.summary_text,
      summaryTruncated: Boolean(Number(row.summary_truncated)),
      processedAt: parseClickhouseUTCDateTimeFormat(row.processed_at),
    })),
    next,
  };
}

/** Lists each trace's current assignment per facet: assigned or outlier. */
export async function listCurrentTopicAssignments(
  input: ListInput,
): Promise<{ rows: TopicAssignmentRow[]; next?: TopicResultCursor }> {
  const { rows, next } = await listCurrentRows<{
    trace_id: string;
    facet_id: string;
    facet_version: number;
    unit_start_time: string;
    topic_status: TopicAssignmentRow["status"];
    topic_id: string;
    topic_version_id: string;
    clustering_run_id: string;
    assigned_at: string;
  }>({
    ...input,
    kind: "assignments",
    select: `trace_id, facet_id, facet_version, unit_start_time, topic_status,
      topic_id, topic_version_id, clustering_run_id, assigned_at`,
  });
  return {
    rows: rows.map((row) => ({
      traceId: row.trace_id,
      facetId: row.facet_id,
      facetVersion: Number(row.facet_version),
      timestamp: parseClickhouseUTCDateTimeFormat(row.unit_start_time),
      status: row.topic_status,
      topicId: row.topic_id || null,
      topicVersionId: row.topic_version_id || null,
      runId: row.clustering_run_id || null,
      assignedAt: parseClickhouseUTCDateTimeFormat(row.assigned_at),
    })),
    next,
  };
}
