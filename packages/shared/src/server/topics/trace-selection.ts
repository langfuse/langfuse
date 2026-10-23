import type { z } from "zod";
import type { PrismaClient } from "../../db";
import { eventsTableCols } from "../../eventsTable";
import type { topicTraceSelectionCriteriaSchema } from "../../topics";
import { applyCommentFilters } from "../services/commentFilterService";
import { CTEQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { buildEventsObservationRowSelection } from "../queries/clickhouse-sql/events-observation-row-selection";
import { FilterList } from "../queries/clickhouse-sql/clickhouse-filter";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { queryClickhouse } from "../repositories/clickhouse";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
} from "../llm/isInternalEvalEnvironment";

type SelectionRows = {
  ids: { id: string };
  backfill: {
    id: string;
    matchedTraceCount: string | number;
  };
  preview: {
    id: string;
    timestampMs: string | number;
    name: string;
    environment: string;
    matchedTraceCount: string | number;
  };
};

/** Select unique trace identities from matching observations. */
export async function selectTopicTraceRows<Mode extends keyof SelectionRows>(
  input: z.infer<typeof topicTraceSelectionCriteriaSchema> & {
    projectId: string;
  },
  prisma: PrismaClient,
  mode: Mode,
): Promise<SelectionRows[Mode][]> {
  const { filterState, hasNoMatches } = await applyCommentFilters({
    projectId: input.projectId,
    prisma,
    objectType: "OBSERVATION",
    filterState: input.filter.map((filter) =>
      filter.column === "tags" ? { ...filter, column: "traceTags" } : filter,
    ),
  });
  if (hasNoMatches) return [];

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
  const preview = mode === "preview";
  const matching = queryBuilder
    .selectRaw(
      "e.trace_id AS id",
      "e.start_time AS start_time",
      "e.span_id AS span_id",
      "e.event_ts AS event_ts",
      "e.environment AS environment",
      ...(preview ? ["e.trace_name AS trace_name"] : []),
    )
    .whereRaw("e.trace_id != ''")
    .buildWithParams();
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
      ...(mode === "ids"
        ? []
        : [
            "count() OVER () AS matchedTraceCount",
            ...(preview
              ? [
                  "toUnixTimestamp64Milli(t.timestamp) AS timestampMs",
                  "t.name AS name",
                  "t.environment AS environment",
                ]
              : []),
          ]),
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
