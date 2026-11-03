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

type StringMatch = {
  operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
  value: string;
};
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
  | { column: "summary"; match: StringMatch }
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

function stringMatchSql(
  expression: string,
  match: StringMatch,
  params: SqlParams,
) {
  const value = params.add("String", match.value);
  switch (match.operator) {
    case "=":
      return `lowerUTF8(${expression}) = lowerUTF8(${value})`;
    case "contains":
      return `positionCaseInsensitiveUTF8(${expression}, ${value}) > 0`;
    case "does not contain":
      return `positionCaseInsensitiveUTF8(${expression}, ${value}) = 0`;
    case "starts with":
      return `startsWith(lowerUTF8(${expression}), lowerUTF8(${value}))`;
    case "ends with":
      return `endsWith(lowerUTF8(${expression}), lowerUTF8(${value}))`;
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
    case "summary":
      return stringMatchSql("summary", condition.match, params);
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
};

/**
 * Pages current results of one row per trace and facet, ordered by the trace's
 * source time. Assignment rows (and summary rows filtered by assignment) read
 * `current`; other summary rows skip the assignment join.
 */
async function listCurrentRows<
  T extends { trace_id: string; facet_id: string; unit_start_time: string },
>(
  input: ListInput & {
    kind: "summaries" | "assignments";
    select: string;
    extraParams?: Record<string, unknown>;
  },
): Promise<{ rows: T[]; next?: TopicResultCursor }> {
  if (input.facetIds.length === 0) return { rows: [] };
  const params = new SqlParams();
  const summaryConditions = input.conditions.flatMap(
    (condition) => summaryConditionSql(condition, params) ?? [],
  );
  const traceIdConditions = input.conditions.flatMap((condition) =>
    condition.column === "traceId"
      ? [inSql("trace_id", condition.match, params)]
      : [],
  );
  const assignmentConditions = input.conditions.flatMap(
    (condition) => assignmentConditionSql(condition, params) ?? [],
  );
  if (input.kind === "assignments")
    assignmentConditions.push("topic_status IN ('assigned', 'outlier')");
  const source =
    input.kind === "summaries" && assignmentConditions.length === 0
      ? "summaries"
      : "current";
  const publishedRunIds =
    source === "current"
      ? (
          await prisma.topicClusteringRun.findMany({
            where: {
              projectId: input.projectId,
              facetId: { in: input.facetIds },
              status: "completed",
            },
            select: { id: true },
          })
        ).map(({ id }) => id)
      : [];
  const direction = input.orderBy === "timestamp.asc" ? "ASC" : "DESC";
  const where = [...(source === "current" ? assignmentConditions : [])];
  if (input.cursor)
    where.push(
      `(unit_start_time, trace_id, facet_id) ${direction === "ASC" ? ">" : "<"} (${params.add("DateTime64(3)", convertDateToClickhouseDateTime(input.cursor.timestamp))}, ${params.add("String", input.cursor.traceId)}, ${params.add("String", input.cursor.facetId)})`,
    );
  const rows = await queryClickhouse<T>({
    query: `WITH ${currentResultsSql(summaryConditions, traceIdConditions)}
      SELECT ${input.select}
      FROM ${source}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY unit_start_time ${direction}, trace_id ${direction}, facet_id ${direction}
      LIMIT {limit:UInt32}`,
    params: {
      ...params.values,
      ...input.extraParams,
      projectId: input.projectId,
      ...timeRangeParams(input.window),
      facetIds: input.facetIds,
      publishedRunIds,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
      limit: input.limit + 1,
    },
    tags: { route: `topics-${input.kind}`, projectId: input.projectId },
  });
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    rows: page,
    next:
      rows.length > input.limit && last
        ? {
            timestamp: parseClickhouseUTCDateTimeFormat(last.unit_start_time),
            traceId: last.trace_id,
            facetId: last.facet_id,
          }
        : undefined,
  };
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
    summary: string;
    summary_truncated: number;
    processed_at: string;
  }>({
    ...input,
    kind: "summaries",
    select: `trace_id, facet_id, facet_version, unit_start_time, trace_name, environment,
      toString(processing_state) AS state,
      if({truncate:Bool}, leftUTF8(summary, {previewLength:UInt32}), summary) AS summary,
      {truncate:Bool} AND lengthUTF8(summary) > {previewLength:UInt32} AS summary_truncated,
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
      summary: row.summary,
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
