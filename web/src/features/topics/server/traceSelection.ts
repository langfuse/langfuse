import { z } from "zod";
import { eventsTableTraceNameSelectSql, singleFilter } from "@langfuse/shared";
import { TOPICS_MAX_TRACES, topicIdSchema } from "@langfuse/shared/topics";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  applyCommentFilters,
  buildEventsObservationRowSelection,
  CTEQueryBuilder,
  queryClickhouse,
} from "@langfuse/shared/src/server";

export const topicTraceSelectionSchema = z
  .object({
    projectId: topicIdSchema,
    filter: z.array(singleFilter).max(100),
    from: z.date(),
    to: z.date(),
    limit: z.number().int().min(1).max(TOPICS_MAX_TRACES),
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

type TraceSelectionRow = {
  id: string;
  timestampMs: string;
  name: string;
  environment: string;
  matchedTraceCount: string;
};

/** Observation filters choose trace identities; the pipeline reads each full trace. */
export async function previewTopicTraces(
  input: z.infer<typeof topicTraceSelectionSchema>,
  prisma: PrismaClient,
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
  if (hasNoMatches) return { matchedTraceCount: 0, traces: [], sampledAt };

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

  const selected = new CTEQueryBuilder()
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
    ])
    .limit(input.limit)
    .buildWithParams();
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
  return {
    matchedTraceCount: Number(rows[0]?.matchedTraceCount ?? 0),
    traces: rows.map((row) => ({
      id: row.id,
      timestamp: new Date(Number(row.timestampMs)),
      name: row.name || null,
      environment: row.environment,
    })),
    sampledAt,
  };
}
