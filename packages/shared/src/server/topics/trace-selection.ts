import type { z } from "zod";
import type { PrismaClient } from "../../db";
import { eventsTableCols } from "../../eventsTable";
import type {
  TopicFacetRef,
  topicTraceSelectionCriteriaSchema,
} from "../../topics";
import { applyCommentFilters } from "../services/commentFilterService";
import { CTEQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { buildEventsObservationRowSelection } from "../queries/clickhouse-sql/events-observation-row-selection";
import { FilterList } from "../queries/clickhouse-sql/clickhouse-filter";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { queryClickhouse } from "../repositories/clickhouse";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
} from "../llm/isInternalEvalEnvironment";

type SelectionRows = {
  ids: { id: string };
  preview: {
    id: string;
    timestampMs: string | number;
    name: string;
    environment: string;
    matchedTraceCount: string | number;
  };
};

// A summary dates from its trace's first event, and the matching observation
// can follow later in the trace. A trace that matches more than an hour after
// it starts is missed when it starts within that hour before the window's end.
const TRACE_SPAN_MARGIN_MS = 60 * 60_000;
const SUMMARIZED_MATCH_TIMEOUT_SECONDS = 60;

/**
 * Observations in a window that meet every filter, with their trace ID; null
 * when comment filters already exclude everything. `restriction` is a further
 * condition on the events row `e`.
 */
async function matchingObservationsQuery(
  input: {
    projectId: string;
    filter: z.infer<typeof topicTraceSelectionCriteriaSchema>["filter"];
    from: Date;
    to: Date;
  },
  prisma: PrismaClient,
  preview: boolean,
  restriction?: { condition: string; params: Record<string, unknown> },
) {
  const { filterState, hasNoMatches } = await applyCommentFilters({
    projectId: input.projectId,
    prisma,
    objectType: "OBSERVATION",
    filterState: input.filter.map((filter) =>
      filter.column === "tags" ? { ...filter, column: "traceTags" } : filter,
    ),
  });
  if (hasNoMatches) return null;

  const { queryBuilder } = buildEventsObservationRowSelection({
    projectId: input.projectId,
    filter: filterState
      .filter((filter) => filter.column !== "traceName")
      .concat([
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: input.from,
        },
        {
          column: "startTime",
          type: "datetime",
          operator: "<",
          value: input.to,
        },
      ]),
  });
  queryBuilder.applyFilters(
    new FilterList(
      createFilterFromFilterState(
        filterState.filter((filter) => filter.column === "traceName"),
        [
          {
            uiTableName: "Trace Name",
            uiTableId: "traceName",
            clickhouseTableName: "events_proto",
            clickhouseSelect: "nullIf(e.trace_name, '')",
          },
        ],
        eventsTableCols,
      ),
    ),
  );
  return queryBuilder
    .selectRaw(
      "e.trace_id AS id",
      "e.start_time AS start_time",
      "e.span_id AS span_id",
      "e.event_ts AS event_ts",
      "e.environment AS environment",
      ...(preview ? ["e.trace_name AS trace_name"] : []),
    )
    .whereRaw("e.trace_id != ''")
    .whereRaw(restriction?.condition ?? "", restriction?.params)
    .buildWithParams();
}

/**
 * IDs of the traces that meet a rule filter, among those whose summary of the
 * facet dates from the window. The summarized traces bound the result and the
 * query's memory, whatever the project's event volume.
 *
 * Reads the window's events on every call, and the nightly refit repeats it
 * per rule and facet over up to 30 days. A filter on a wide column (metadata,
 * tags) reads that column for every event in the window; the summarized-trace
 * condition does not narrow that read. Revisit this if the
 * `topics-refit-filter-match` route shows up in ClickHouse load or timeouts.
 */
export async function selectSummarizedTopicMatches(
  input: Parameters<typeof matchingObservationsQuery>[0] & {
    facet: TopicFacetRef;
  },
  prisma: PrismaClient,
): Promise<string[]> {
  const matching = await matchingObservationsQuery(
    { ...input, to: new Date(input.to.getTime() + TRACE_SPAN_MARGIN_MS) },
    prisma,
    false,
    {
      condition: `e.trace_id IN (
        SELECT trace_id
        FROM topic_facet_summaries
        WHERE project_id = {summaryProjectId: String}
          AND unit_start_time >= {summaryFrom: DateTime64(3)}
          AND unit_start_time < {summaryTo: DateTime64(3)}
          AND facet_id = {summaryFacetId: String}
          AND facet_version = {summaryFacetVersion: UInt32}
          AND trace_id != ''
      )`,
      params: {
        summaryProjectId: input.projectId,
        summaryFacetId: input.facet.facetId,
        summaryFacetVersion: input.facet.version,
        summaryFrom: convertDateToClickhouseDateTime(input.from),
        summaryTo: convertDateToClickhouseDateTime(input.to),
      },
    },
  );
  if (!matching) return [];
  const rows = await queryClickhouse<{ id: string }>({
    query: `SELECT DISTINCT id FROM (${matching.query})`,
    params: matching.params,
    preferredClickhouseService: "EventsReadOnly",
    tags: { projectId: input.projectId, route: "topics-refit-filter-match" },
    // The client must outlast the server limit for the timeout to be reported as one.
    clickhouseConfigs: {
      request_timeout: (SUMMARIZED_MATCH_TIMEOUT_SECONDS + 15) * 1000,
    },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: SUMMARIZED_MATCH_TIMEOUT_SECONDS,
      timeout_overflow_mode: "throw",
    },
  });
  return rows.map((row) => row.id);
}

/**
 * IDs of traces with an observation in the window that meets every filter, as
 * a subquery; null when nothing can match.
 */
export async function topicMatchingTraceIdsQuery(
  input: Parameters<typeof matchingObservationsQuery>[0],
  prisma: PrismaClient,
): Promise<{ query: string; params: Record<string, unknown> } | null> {
  const matching = await matchingObservationsQuery(input, prisma, false);
  return matching
    ? {
        query: `SELECT DISTINCT id FROM (${matching.query})`,
        params: matching.params,
      }
    : null;
}

/** Select unique trace identities from matching observations. */
export async function selectTopicTraceRows<Mode extends keyof SelectionRows>(
  input: z.infer<typeof topicTraceSelectionCriteriaSchema> & {
    projectId: string;
  },
  prisma: PrismaClient,
  mode: Mode,
): Promise<SelectionRows[Mode][]> {
  const preview = mode === "preview";
  const matching = await matchingObservationsQuery(input, prisma, preview);
  if (!matching) return [];
  const traces = new CTEQueryBuilder()
    .withCTE("matching_observations", {
      ...matching,
      schema: [
        "id",
        "start_time",
        "span_id",
        "event_ts",
        "environment",
        ...(preview ? (["trace_name"] as const) : []),
      ] as const,
    })
    .from("matching_observations", "m")
    .select(
      "m.id AS id",
      "max(m.start_time) AS latest_match",
      "argMax(m.environment, tuple(m.event_ts, m.span_id, m.environment)) AS environment",
      ...(preview
        ? [
            "min(m.start_time) AS timestamp",
            "anyIf(m.trace_name, m.trace_name != '') AS name",
          ]
        : []),
    )
    .groupBy("m.id")
    .havingRaw(
      "NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}",
      {
        internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
        publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
      },
    )
    .buildWithParams();
  const selection = new CTEQueryBuilder()
    .withCTE("matching_traces", {
      ...traces,
      schema: [
        "id",
        "latest_match",
        "environment",
        ...(preview ? (["name", "timestamp"] as const) : []),
      ] as const,
    })
    .from("matching_traces", "t")
    .select(
      "t.id AS id",
      ...(preview
        ? [
            "toUnixTimestamp64Milli(t.timestamp) AS timestampMs",
            "count() OVER () AS matchedTraceCount",
            "t.name AS name",
            "t.environment AS environment",
          ]
        : []),
    )
    .orderByColumns([
      input.sampling === "random"
        ? {
            column: "cityHash64(t.id, {samplingSeed: String})",
            direction: "ASC",
          }
        : { column: "t.latest_match", direction: "DESC" },
      { column: "t.id", direction: "ASC" },
    ]);
  const limit = preview ? Math.min(input.limit ?? Infinity, 20) : input.limit;
  if (limit !== null) selection.limit(limit);
  const selected = selection.buildWithParams();
  return queryClickhouse<SelectionRows[Mode]>({
    ...selected,
    params: { ...selected.params, samplingSeed: input.seed },
    preferredClickhouseService: "EventsReadOnly",
    tags: { projectId: input.projectId, route: "topics-trace-selection" },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    },
  });
}
