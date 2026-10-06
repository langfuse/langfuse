import type { z } from "zod";
import type { PrismaClient } from "../../db";
import { eventsTableTraceNameSelectSql } from "../../eventsTable";
import type { topicTraceSelectionCriteriaSchema } from "../../topics";
import { applyCommentFilters } from "../services/commentFilterService";
import { CTEQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { buildEventsObservationRowSelection } from "../queries/clickhouse-sql/events-observation-row-selection";
import { queryClickhouse } from "../repositories/clickhouse";
import {
  INTERNAL_EVAL_ENVIRONMENT_PREFIX,
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
} from "../llm/isInternalEvalEnvironment";

type SelectionRows = {
  ids: { id: string };
  backfill: {
    id: string;
    timestampMs: string | number;
    latestMs: string | number;
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

/** Matching observations select trace identities; processing reads each full trace. */
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
    filter: filterState.concat([
      {
        column: "startTime",
        type: "datetime",
        operator: ">=",
        value: input.from,
      },
      { column: "startTime", type: "datetime", operator: "<", value: input.to },
    ]),
  });
  const preview = mode === "preview";
  const matching = queryBuilder
    .selectRaw(
      "e.trace_id AS id",
      "e.start_time AS start_time",
      ...(preview
        ? [
            "e.span_id AS span_id",
            "e.event_ts AS event_ts",
            `${eventsTableTraceNameSelectSql} AS trace_name`,
            "e.environment AS environment",
          ]
        : []),
    )
    .whereRaw("e.trace_id != ''")
    .whereRaw(
      "NOT startsWith(e.environment, {internalEnvironmentPrefix:String}) AND e.environment != {publicLlmJudgeEnvironment:String}",
      {
        internalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
        publicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
      },
    )
    .buildWithParams();
  const traces = new CTEQueryBuilder()
    .withCTE("matching_observations", {
      ...matching,
      schema: [
        "id",
        "start_time",
        ...(preview
          ? (["span_id", "event_ts", "trace_name", "environment"] as const)
          : []),
      ] as const,
    })
    .from("matching_observations", "m")
    .select(
      "m.id AS id",
      "min(m.start_time) AS timestamp",
      "max(m.start_time) AS latest_match",
      ...(preview
        ? [
            "argMaxIf(m.trace_name, tuple(m.event_ts, m.span_id, m.trace_name), m.trace_name != '') AS name",
            "argMax(m.environment, tuple(m.event_ts, m.span_id, m.environment)) AS environment",
          ]
        : []),
    )
    .groupBy("m.id")
    .buildWithParams();
  const selection = new CTEQueryBuilder()
    .withCTE("matching_traces", {
      ...traces,
      schema: [
        "id",
        "timestamp",
        "latest_match",
        ...(preview ? (["name", "environment"] as const) : []),
      ] as const,
    })
    .from("matching_traces", "t")
    .select(
      "t.id AS id",
      ...(mode === "ids"
        ? []
        : [
            "toUnixTimestamp64Milli(t.timestamp) AS timestampMs",
            "count() OVER () AS matchedTraceCount",
            ...(preview
              ? ["t.name AS name", "t.environment AS environment"]
              : ["toUnixTimestamp64Milli(t.latest_match) AS latestMs"]),
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
  const limit = preview ? Math.min(input.limit ?? Infinity, 100) : input.limit;
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
