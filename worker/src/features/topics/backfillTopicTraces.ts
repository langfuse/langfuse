import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { eventsTableTraceNameSelectSql } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  applyCommentFilters,
  buildEventsObservationRowSelection,
  CTEQueryBuilder,
  queryClickhouse,
  QueueJobs,
  TraceBatchEventSchema,
  TraceBatchQueue,
} from "@langfuse/shared/src/server";
import { topicTraceSelectionCriteriaSchema } from "@langfuse/shared/topics";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";

type Selection = z.infer<typeof topicTraceSelectionCriteriaSchema>;
type Filter = Selection["filter"][number];

type SelectedTrace = {
  id: string;
  timestamp: Date;
  latest: Date;
};

type SelectionResult = {
  matchedTraceCount: number;
  traces: SelectedTrace[];
};

type TraceSelectionRow = {
  id: string;
  timestampMs: string;
  latestMs: string;
  matchedTraceCount: string;
};

/**
 * Same observation filters as the Topics page. A trace is selected when one
 * observation matches every filter; the queued job then reads that whole trace.
 */
export async function selectTopicTracesForBackfill(
  input: Selection & { projectId: string },
  prisma: PrismaClient,
): Promise<SelectionResult> {
  const { filterState, hasNoMatches } = await applyCommentFilters({
    projectId: input.projectId,
    prisma,
    objectType: "OBSERVATION",
    filterState: input.filter.map((filter) =>
      filter.column === "tags" ? { ...filter, column: "traceTags" } : filter,
    ),
  });
  if (hasNoMatches) return { matchedTraceCount: 0, traces: [] };

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
    )
    .groupBy("m.id")
    .buildWithParams();

  const selection = new CTEQueryBuilder()
    .withCTE("matching_traces", {
      ...traces,
      schema: ["id", "timestamp", "latest_match"] as const,
    })
    .from("matching_traces", "t")
    .select(
      "t.id AS id",
      "toUnixTimestamp64Milli(t.timestamp) AS timestampMs",
      "toUnixTimestamp64Milli(t.latest_match) AS latestMs",
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
  if (input.limit !== null) selection.limit(input.limit);
  const selected = selection.buildWithParams();
  const rows = await queryClickhouse<TraceSelectionRow>({
    ...selected,
    params: { ...selected.params, samplingSeed: input.seed },
    preferredClickhouseService: "EventsReadOnly",
    tags: { projectId: input.projectId, route: "topics-trace-backfill" },
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
      latest: new Date(Number(row.latestMs)),
    })),
  };
}

export function backfillSelectionFilters(input: {
  traceNames: string[];
  tags: string[];
  extra: Filter[];
}): Filter[] {
  const filters: Filter[] = [...input.extra];
  if (input.traceNames.length > 0)
    filters.push({
      column: "traceName",
      type: "stringOptions",
      operator: "any of",
      value: input.traceNames,
    });
  if (input.tags.length > 0)
    filters.push({
      column: "tags",
      type: "arrayOptions",
      operator: "any of",
      value: input.tags,
    });
  return filters;
}

export async function enqueueTopicTraceBackfill(params: {
  projectId: string;
  selection: Selection;
  apply: boolean;
  selectTraces?: () => Promise<SelectionResult>;
  addJob?: (
    name: string,
    data: unknown,
    options: { jobId: string },
  ) => Promise<unknown>;
}): Promise<{ matched: number; traceIds: string[]; enqueued: number }> {
  if (!isTopicsProjectEnabled(params.projectId))
    throw new Error(
      "Topics is not enabled for this project. Set LANGFUSE_TOPICS_ENABLED_PROJECT_IDS on the worker.",
    );
  const selected = await (
    params.selectTraces ??
    (async () => {
      const { prisma } = await import("@langfuse/shared/src/db");
      return selectTopicTracesForBackfill(
        { ...params.selection, projectId: params.projectId },
        prisma,
      );
    })
  )();
  const traceIds = selected.traces.map((trace) => trace.id);
  if (!params.apply)
    return { matched: selected.matchedTraceCount, traceIds, enqueued: 0 };

  const queue = TraceBatchQueue.getInstance();
  if (!queue)
    throw new Error(
      "Trace batch queue is unavailable. NEXT_PUBLIC_LANGFUSE_CLOUD_REGION must be set in this process.",
    );
  const add =
    params.addJob ??
    ((name, data, options) => queue.add(name, data as never, options));
  for (const trace of selected.traces) {
    const minStart = trace.timestamp.getTime();
    const maxStart = Math.max(minStart, trace.latest.getTime());
    const jobTrace = {
      projectId: params.projectId,
      traceId: trace.id,
      minStart,
      maxStart,
      revision: randomUUID(),
    };
    const id = createHash("sha256")
      .update(JSON.stringify([jobTrace]))
      .digest("hex");
    const data = TraceBatchEventSchema.parse({
      id,
      timestamp: new Date(),
      name: QueueJobs.TraceBatch,
      payload: { traces: [jobTrace] },
    });
    await add(QueueJobs.TraceBatch, data, { jobId: id });
  }
  return {
    matched: selected.matchedTraceCount,
    traceIds,
    enqueued: selected.traces.length,
  };
}
