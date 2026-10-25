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
import { OBSERVATIONS_TO_TRACE_INTERVAL } from "./constants";

export const TOPIC_TRACE_STATUSES = [
  "assigned",
  "outlier",
  "awaiting_map",
  "not_applicable",
  "insufficient_input",
  "not_processed",
] as const;
export type TopicTraceStatus = (typeof TOPIC_TRACE_STATUSES)[number];

export const TOPIC_TRACE_SUMMARY_PREVIEW_LENGTH = 500;

type StringMatch = {
  operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
  value: string;
};
type OptionsMatch = { operator: "any of" | "none of"; values: string[] };
type ComparisonOperator = "=" | ">" | "<" | ">=" | "<=";
type DateMatch = { operator: Exclude<ComparisonOperator, "=">; value: Date };
type NumberMatch = { operator: ComparisonOperator; value: number };

/**
 * Conditions on the current per-trace results. Facet-scoped conditions carry
 * resolved facet ids; text matches are case-insensitive, `userId` and
 * `topicId` match exactly.
 */
export type TopicTraceCondition =
  | { column: "traceId" | "environment"; match: OptionsMatch }
  | { column: "traceName" | "sessionId"; match: StringMatch | OptionsMatch }
  | { column: "userId"; match: OptionsMatch }
  | { column: "timestamp" | "processedAt"; match: DateMatch }
  | { column: "topicId"; facetId?: string; match: OptionsMatch }
  | {
      column: "topicStatus";
      facetId: string;
      match: { operator: "any of" | "none of"; values: TopicTraceStatus[] };
    }
  | {
      column: "summary";
      facetId: string;
      match: StringMatch | { operator: "is set" | "is not set" };
    }
  | { column: "facetVersion"; facetId: string; match: NumberMatch };

export type TopicTraceCursor = { timestamp: Date; traceId: string };

export type TopicTraceFacetResult = {
  facetId: string;
  facetVersion: number;
  status: Exclude<TopicTraceStatus, "not_processed">;
  summary: string;
  summaryTruncated: boolean;
  processedAt: Date;
  topicId: string | null;
  topicVersionId: string | null;
  runId: string | null;
};

export type TopicTraceRow = {
  traceId: string;
  traceName: string;
  environment: string;
  timestamp: Date;
  /** Null when none of the projected facets has a result for the trace. */
  processedAt: Date | null;
  results: TopicTraceFacetResult[];
};

type Params = Record<string, unknown>;

class SqlParams {
  private count = 0;
  readonly values: Params = {};
  add(type: string, value: unknown) {
    const name = `p${this.count++}`;
    this.values[name] = value;
    return `{${name}:${type}}`;
  }
}

const stringMatchSql = (
  expression: string,
  match: StringMatch | OptionsMatch,
  params: SqlParams,
) => {
  if ("values" in match) {
    const values = params.add("Array(String)", match.values);
    return `${match.operator === "none of" ? "NOT " : ""}has(arrayMap(value -> lowerUTF8(value), ${values}), lowerUTF8(${expression}))`;
  }
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
};

const comparisonSql = (
  expression: string,
  operator: ComparisonOperator,
  value: string,
) => `${expression} ${operator} ${value}`;

/** Trace ids whose events carry one of the user ids, within the summaries' window. */
const userTraceIdsSql = (values: string[], params: SqlParams) =>
  `SELECT trace_id FROM events_core
    WHERE project_id = {projectId:String}
      AND start_time >= {from:DateTime64(3)}
      AND start_time < {to:DateTime64(3)} + ${OBSERVATIONS_TO_TRACE_INTERVAL}
      AND user_id IN ${params.add("Array(String)", values)}
      AND is_deleted = 0`;

/** Trace attributes are copied onto every summary row, so they filter before grouping. */
function rowConditionSql(condition: TopicTraceCondition, params: SqlParams) {
  switch (condition.column) {
    case "traceId":
      return `trace_id ${condition.match.operator === "none of" ? "NOT IN" : "IN"} ${params.add("Array(String)", condition.match.values)}`;
    case "environment":
      return stringMatchSql("environment", condition.match, params);
    case "traceName":
      return stringMatchSql("trace_name", condition.match, params);
    case "sessionId":
      return stringMatchSql("session_id", condition.match, params);
    case "userId":
      return `trace_id ${condition.match.operator === "none of" ? "NOT IN" : "IN"} (${userTraceIdsSql(condition.match.values, params)})`;
    default:
      return null;
  }
}

/** Latest processing time across the projected facets; NULL when none of them has a result. */
const rowProcessedAtSql =
  "maxIfOrNull(result_processed_at, facet_id IN {projectedFacetIds:Array(String)})";

const facetSql = (facetId: string, params: SqlParams) =>
  `facet_id = ${params.add("String", facetId)}`;

function groupConditionSql(condition: TopicTraceCondition, params: SqlParams) {
  switch (condition.column) {
    case "timestamp":
      return comparisonSql(
        "min(unit_start_time)",
        condition.match.operator,
        params.add(
          "DateTime64(3)",
          convertDateToClickhouseDateTime(condition.match.value),
        ),
      );
    case "processedAt":
      return comparisonSql(
        rowProcessedAtSql,
        condition.match.operator,
        params.add(
          "DateTime64(3)",
          convertDateToClickhouseDateTime(condition.match.value),
        ),
      );
    case "topicId": {
      const scope = condition.facetId
        ? `${facetSql(condition.facetId, params)} AND `
        : "";
      const matches = `countIf(${scope}topic_status = 'assigned' AND topic_id IN ${params.add("Array(String)", condition.match.values)})`;
      return condition.match.operator === "none of"
        ? `${matches} = 0`
        : `${matches} > 0`;
    }
    case "topicStatus": {
      const facet = facetSql(condition.facetId, params);
      const statuses = condition.match.values.filter(
        (status) => status !== "not_processed",
      );
      const includesNotProcessed =
        statuses.length < condition.match.values.length;
      const matches = `countIf(${facet} AND topic_status IN ${params.add("Array(String)", statuses)})`;
      const processed = `countIf(${facet})`;
      if (condition.match.operator === "any of")
        return includesNotProcessed
          ? `(${matches} > 0 OR ${processed} = 0)`
          : `${matches} > 0`;
      return includesNotProcessed
        ? `(${matches} = 0 AND ${processed} > 0)`
        : `${matches} = 0`;
    }
    case "summary": {
      const facet = facetSql(condition.facetId, params);
      const { match } = condition;
      if (!("value" in match))
        return `countIf(${facet} AND summary != '') ${match.operator === "is set" ? ">" : "="} 0`;
      if (match.operator === "does not contain")
        return `countIf(${facet} AND ${stringMatchSql("summary", { operator: "contains", value: match.value }, params)}) = 0`;
      return `countIf(${facet} AND ${stringMatchSql("summary", match, params)}) > 0`;
    }
    case "facetVersion":
      return `countIf(${facetSql(condition.facetId, params)} AND ${comparisonSql(
        "facet_version",
        condition.match.operator,
        params.add("UInt32", condition.match.value),
      )}) > 0`;
    default:
      return null;
  }
}

/**
 * One row per trace and facet: the newest facet version's newest summary,
 * joined to its assignment only when the assignment was made for exactly that
 * summary by a completed run (or online). Mirrors `resolveTopicResult`.
 */
function currentResultsSql(
  rowConditions: string[],
  traceIdConditions: string[],
) {
  const scopeSql = `trace_id != '' AND facet_id IN {facetIds:Array(String)}`;
  const and = (conditions: string[]) =>
    conditions.map((sql) => `AND ${sql}`).join(" ");
  const rowFilter = and(rowConditions);
  const latestScopeSql = [scopeSql, ...traceIdConditions].join(" AND ");
  return `
  summaries AS (
    SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at,
      processing_state, summary, trace_name, environment
    FROM topic_facet_summaries
    WHERE project_id = {projectId:String} AND ${unitTimeFilterSql} AND ${scopeSql}
      AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
      AND environment != {publicLlmJudgeEnvironment:String}
      ${rowFilter}
      AND ${latestSummaryFilterSql(latestScopeSql, summarySourceKeySql)}
    ORDER BY facet_version DESC, processed_at DESC
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
    SELECT trace_id, facet_id, facet_version, unit_start_time, processing_state,
      summary, trace_name, environment,
      processing_state = 'complete' AND a_trace_id != ''
        AND a_facet_version = facet_version AND a_unit_start_time = unit_start_time
        AND a_summary_processed_at = processed_at AS matched,
      if(matched, a_topic_id, '') AS topic_id,
      if(matched, a_topic_version_id, '') AS topic_version_id,
      if(matched, a_run_id, '') AS clustering_run_id,
      multiIf(
        processing_state != 'complete', processing_state,
        NOT matched, 'awaiting_map',
        topic_id != '', 'assigned',
        'outlier'
      ) AS topic_status,
      if(matched, greatest(processed_at, a_assigned_at), processed_at) AS result_processed_at
    FROM summaries
    LEFT JOIN assignments ON a_trace_id = trace_id AND a_facet_id = facet_id
  )`;
}

function buildQuery(input: {
  projectId: string;
  window: TopicTimeRange;
  facetIds: string[];
  projectedFacetIds: string[];
  conditions: TopicTraceCondition[];
  publishedRunIds: string[];
}) {
  const params = new SqlParams();
  const rowConditions = input.conditions.flatMap((condition) => {
    const sql = rowConditionSql(condition, params);
    return sql ? [sql] : [];
  });
  const traceIdConditions = input.conditions.flatMap((condition) =>
    condition.column === "traceId"
      ? [rowConditionSql(condition, params) as string]
      : [],
  );
  const groupConditions = input.conditions.flatMap((condition) => {
    const sql = groupConditionSql(condition, params);
    return sql ? [sql] : [];
  });
  return {
    withSql: `WITH ${currentResultsSql(rowConditions, traceIdConditions)}`,
    groupConditions,
    params: {
      ...params.values,
      projectId: input.projectId,
      ...timeRangeParams(input.window),
      facetIds: input.facetIds,
      projectedFacetIds: input.projectedFacetIds,
      publishedRunIds: input.publishedRunIds,
      internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
    },
  };
}

const groupedTracesSql = (conditions: string[]) => `
  SELECT trace_id, min(unit_start_time) AS timestamp,
    ${rowProcessedAtSql} AS row_processed_at,
    any(trace_name) AS trace_name, any(environment) AS environment
  FROM current
  GROUP BY trace_id
  ${conditions.length ? `HAVING ${conditions.join(" AND ")}` : ""}`;

/** Results of one page's traces; re-resolves only those traces, so no grouping conditions apply. */
async function loadDetails(
  input: Parameters<typeof listCurrentTopicTraces>[0],
  publishedRunIds: string[],
  pageRows: { trace_id: string }[],
) {
  const query = buildQuery({
    ...input,
    facetIds: input.projectedFacetIds,
    conditions: [
      {
        column: "traceId",
        match: {
          operator: "any of",
          values: pageRows.map((row) => row.trace_id),
        },
      },
    ],
    publishedRunIds,
  });
  return queryClickhouse<{
    trace_id: string;
    facet_id: string;
    facet_version: number;
    topic_status: TopicTraceFacetResult["status"];
    summary: string;
    summary_truncated: number;
    result_processed_at: string;
    topic_id: string;
    topic_version_id: string;
    clustering_run_id: string;
  }>({
    query: `${query.withSql}
      SELECT trace_id, facet_id, facet_version, topic_status,
        if({truncate:Bool}, leftUTF8(summary, {previewLength:UInt32}), summary) AS summary,
        {truncate:Bool} AND lengthUTF8(summary) > {previewLength:UInt32} AS summary_truncated,
        result_processed_at, topic_id, topic_version_id, clustering_run_id
      FROM current`,
    params: {
      ...query.params,
      truncate: input.truncateSummaries,
      previewLength: TOPIC_TRACE_SUMMARY_PREVIEW_LENGTH,
    },
    tags: { route: "topics-traces-details", projectId: input.projectId },
  });
}

/**
 * Lists traces with their current Topics result per facet, newest first by
 * trace start. A trace appears when it has a result for any facet in
 * `facetIds`; `results` are limited to `projectedFacetIds`. Older facet
 * versions remain current until the trace is summarized with a newer one.
 */
export async function listCurrentTopicTraces(input: {
  projectId: string;
  window: TopicTimeRange;
  facetIds: string[];
  projectedFacetIds: string[];
  conditions: TopicTraceCondition[];
  orderBy: "timestamp.desc" | "timestamp.asc";
  limit: number;
  cursor?: TopicTraceCursor;
  includeTotal: boolean;
  truncateSummaries: boolean;
}): Promise<{
  rows: TopicTraceRow[];
  next?: TopicTraceCursor;
  total?: number;
}> {
  if (input.facetIds.length === 0)
    return { rows: [], ...(input.includeTotal ? { total: 0 } : {}) };
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
  const query = buildQuery({ ...input, publishedRunIds });
  const direction = input.orderBy === "timestamp.asc" ? "ASC" : "DESC";
  const keyset = input.cursor
    ? [
        `(min(unit_start_time), trace_id) ${direction === "ASC" ? ">" : "<"} ({cursorTimestamp:DateTime64(3)}, {cursorTraceId:String})`,
      ]
    : [];
  const tags = { route: "topics-traces", projectId: input.projectId };

  const [page, total] = await Promise.all([
    queryClickhouse<{
      trace_id: string;
      timestamp: string;
      row_processed_at: string | null;
      trace_name: string;
      environment: string;
    }>({
      query: `${query.withSql}
        ${groupedTracesSql([...query.groupConditions, ...keyset])}
        ORDER BY timestamp ${direction}, trace_id ${direction}
        LIMIT {limit:UInt32}`,
      params: {
        ...query.params,
        limit: input.limit + 1,
        ...(input.cursor
          ? {
              cursorTimestamp: convertDateToClickhouseDateTime(
                input.cursor.timestamp,
              ),
              cursorTraceId: input.cursor.traceId,
            }
          : {}),
      },
      tags,
    }),
    input.includeTotal
      ? queryClickhouse<{ total: string }>({
          query: `${query.withSql}
            SELECT count() AS total FROM (${groupedTracesSql(query.groupConditions)})`,
          params: query.params,
          tags: { ...tags, route: "topics-traces-count" },
        }).then(([row]) => Number(row?.total ?? 0))
      : Promise.resolve(undefined),
  ]);

  const pageRows = page.slice(0, input.limit);
  const details = pageRows.length
    ? await loadDetails(input, publishedRunIds, pageRows)
    : [];
  const detailsByTrace = new Map<string, TopicTraceFacetResult[]>();
  for (const detail of details) {
    const list = detailsByTrace.get(detail.trace_id) ?? [];
    list.push({
      facetId: detail.facet_id,
      facetVersion: Number(detail.facet_version),
      status: detail.topic_status,
      summary: detail.summary,
      summaryTruncated: Boolean(Number(detail.summary_truncated)),
      processedAt: parseClickhouseUTCDateTimeFormat(detail.result_processed_at),
      topicId: detail.topic_id || null,
      topicVersionId: detail.topic_version_id || null,
      runId: detail.clustering_run_id || null,
    });
    detailsByTrace.set(detail.trace_id, list);
  }
  const last = pageRows.at(-1);
  return {
    rows: pageRows.map((row) => ({
      traceId: row.trace_id,
      traceName: row.trace_name,
      environment: row.environment,
      timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
      processedAt: row.row_processed_at
        ? parseClickhouseUTCDateTimeFormat(row.row_processed_at)
        : null,
      results: detailsByTrace.get(row.trace_id) ?? [],
    })),
    next:
      page.length > input.limit && last
        ? {
            timestamp: parseClickhouseUTCDateTimeFormat(last.timestamp),
            traceId: last.trace_id,
          }
        : undefined,
    total,
  };
}
