import { z } from "zod";
import {
  eventsTableTraceNameSelectSql,
  InvalidRequestError,
  singleFilterList,
} from "@langfuse/shared";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  topicTraceIdSchema,
} from "@langfuse/shared/topics";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  applyCommentFilters,
  buildEventsObservationRowSelection,
  CTEQueryBuilder,
  queryClickhouse,
} from "@langfuse/shared/src/server";

const traceSelectionCriteriaSchema = z
  .object({
    filter: singleFilterList.refine((filters) => filters.length <= 100, {
      message: "Select at most 100 filters.",
    }),
    from: z.date(),
    to: z.date(),
    limit: z.number().int().positive().nullable().default(null),
    sampling: z.enum(["random", "latest"]),
    seed: z.string().min(1).max(128),
  })
  .refine(({ from, to }) => from < to, {
    message: "Choose an end time after the start time.",
    path: ["to"],
  })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 93 * 86400000, {
    message: "Select at most 93 days of traces.",
    path: ["from"],
  })
  .refine(
    ({ filter }) => !filter.some((item) => item.type === "positionInTrace"),
    {
      message:
        "Position-in-trace filters are not supported for Topics selection.",
      path: ["filter"],
    },
  );

export const topicTraceSelectionSchema =
  traceSelectionCriteriaSchema.safeExtend({
    projectId: topicIdSchema,
  });

export const topicTriggerInputSchema = z.union([
  topicExecutionInputSchema,
  topicExecutionInputSchema.options[0]
    .omit({ traceIds: true, operation: true })
    .extend({
      operation: z.enum(["discover", "refresh", "assign"]),
      targetRunIds: z.record(topicIdSchema, topicIdSchema).optional(),
      selection: traceSelectionCriteriaSchema.safeExtend({
        excludedTraceIds: z.array(topicTraceIdSchema).default([]),
      }),
    })
    .refine(
      (value) =>
        value.operation !== "assign" ||
        value.facetVersionIds.every((id) => value.targetRunIds?.[id]),
      { message: "Select a target map for every facet." },
    ),
]);

type TraceSelectionRow = {
  id: string;
  timestampMs: string;
  name: string;
  environment: string;
  matchedTraceCount: string;
};

/** Observation filters choose trace identities; the pipeline reads each full trace. */
async function selectTopicTraces(
  input: z.infer<typeof topicTraceSelectionSchema>,
  prisma: PrismaClient,
  preview: boolean,
) {
  const sampledAt = new Date();
  const { filterState, hasNoMatches } = await applyCommentFilters({
    projectId: input.projectId,
    prisma,
    objectType: "OBSERVATION",
    filterState: input.filter.map((filter) =>
      filter.column === "tags" ? { ...filter, column: "traceTags" } : filter,
    ),
  });
  if (hasNoMatches)
    return {
      matchedTraceCount: 0,
      selectedTraceCount: 0,
      traces: [],
      sampledAt,
    };

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
  const matching = queryBuilder
    .selectRaw(
      "e.trace_id AS id",
      "e.span_id AS span_id",
      "e.start_time AS start_time",
      "e.event_ts AS event_ts",
      `${eventsTableTraceNameSelectSql} AS trace_name`,
      "e.environment AS environment",
    )
    .whereRaw("e.trace_id != ''")
    .buildWithParams();

  const traces = new CTEQueryBuilder()
    .withCTE("matching_observations", {
      ...matching,
      schema: [
        "id",
        "span_id",
        "start_time",
        "event_ts",
        "trace_name",
        "environment",
      ] as const,
    })
    .from("matching_observations", "m")
    .select(
      "m.id AS id",
      "min(m.start_time) AS timestamp",
      "max(m.start_time) AS latest_match",
      "argMaxIf(m.trace_name, tuple(m.event_ts, m.span_id, m.trace_name), m.trace_name != '') AS name",
      "argMax(m.environment, tuple(m.event_ts, m.span_id, m.environment)) AS environment",
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
        "name",
        "environment",
      ] as const,
    })
    .from("matching_traces", "t")
    .select(
      "t.id AS id",
      "toUnixTimestamp64Milli(t.timestamp) AS timestampMs",
      "t.name AS name",
      "t.environment AS environment",
      "count() OVER () AS matchedTraceCount",
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
  const rows = await queryClickhouse<TraceSelectionRow>({
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
  const matchedTraceCount = Number(rows[0]?.matchedTraceCount ?? 0);
  return {
    matchedTraceCount,
    selectedTraceCount: Math.min(matchedTraceCount, input.limit ?? Infinity),
    traces: rows.map((row) => ({
      id: row.id,
      timestamp: new Date(Number(row.timestampMs)),
      name: row.name || null,
      environment: row.environment,
    })),
    sampledAt,
  };
}

export function previewTopicTraces(
  input: z.infer<typeof topicTraceSelectionSchema>,
  prisma: PrismaClient,
) {
  return selectTopicTraces(input, prisma, true);
}

export async function resolveTopicTraceSelection(
  input: z.infer<typeof topicTriggerInputSchema>,
  prisma: PrismaClient,
) {
  if (!("selection" in input)) return input;
  const { selection, ...execution } = input;
  const result = await selectTopicTraces(
    { ...selection, projectId: input.projectId },
    prisma,
    false,
  );
  const excluded = new Set(selection.excludedTraceIds);
  const traceIds = result.traces
    .filter((trace) => !excluded.has(trace.id))
    .map((trace) => trace.id);
  if (traceIds.length === 0)
    throw new InvalidRequestError(
      "No traces match this selection. Refresh the preview.",
    );
  return topicExecutionInputSchema.parse({
    ...execution,
    traceIds,
  });
}
