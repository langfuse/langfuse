import { createHash, randomUUID } from "node:crypto";
import { chunk } from "lodash";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import {
  CTEQueryBuilder,
  EventsQueryBuilder,
  QueueJobs,
  TraceBatchEventSchema,
  TraceBatchQueue,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { topicTraceSelectionCriteriaSchema } from "@langfuse/shared/topics";
import {
  isTopicsProjectEnabled,
  selectTopicTraceRows,
} from "@langfuse/shared/topics/server";

type Selection = z.infer<typeof topicTraceSelectionCriteriaSchema>;
type Filter = Selection["filter"][number];

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
}): Promise<{ matched: number; traceIds: string[]; enqueued: number }> {
  if (!isTopicsProjectEnabled(params.projectId))
    throw new Error(
      "Topics is not enabled for this project. Set LANGFUSE_TOPICS_ENABLED_PROJECT_IDS on the worker.",
    );
  const rows = await selectTopicTraceRows(
    { ...params.selection, projectId: params.projectId },
    prisma,
    "backfill",
  );
  const traceIds = rows.map((trace) => trace.id);
  const matched = Number(rows[0]?.matchedTraceCount ?? 0);
  if (!params.apply) return { matched, traceIds, enqueued: 0 };

  const queue = TraceBatchQueue.getInstance();
  if (!queue)
    throw new Error(
      "Trace batch queue is unavailable. NEXT_PUBLIC_LANGFUSE_CLOUD_REGION must be set in this process.",
    );
  let enqueued = 0;
  for (const ids of chunk(traceIds, 1_000)) {
    // Matching observations select traces; batch reads need their full bounds.
    const observations = new EventsQueryBuilder({ projectId: params.projectId })
      .selectRaw("e.trace_id", "e.start_time")
      .forceFullTable()
      .whereRaw("e.trace_id IN ({traceIds: Array(String)})", { traceIds: ids })
      .whereRaw(
        "xxHash32(e.trace_id) IN (SELECT arrayJoin(arrayMap(id -> xxHash32(id), {traceIds: Array(String)})))",
      )
      .buildWithParams();
    const boundsQuery = new CTEQueryBuilder()
      .withCTE("observations", {
        ...observations,
        schema: ["trace_id", "start_time"] as const,
      })
      .from("observations", "o")
      .select(
        "o.trace_id AS traceId",
        "min(toUnixTimestamp64Milli(o.start_time)) AS minStart",
        "max(toUnixTimestamp64Milli(o.start_time)) AS maxStart",
      )
      .groupBy("o.trace_id")
      .buildWithParams();
    const bounds = await queryClickhouse<{
      traceId: string;
      minStart: string;
      maxStart: string;
    }>({
      ...boundsQuery,
      preferredClickhouseService: "EventsReadOnly",
      tags: { projectId: params.projectId, route: "topics-backfill-bounds" },
      clickhouseSettings: {
        max_threads: 2,
        max_execution_time: 30,
        timeout_overflow_mode: "throw",
      },
    });
    const boundsById = new Map(bounds.map((bound) => [bound.traceId, bound]));
    for (const traceId of ids) {
      const bound = boundsById.get(traceId);
      if (!bound) continue;
      const jobTrace = {
        projectId: params.projectId,
        traceId,
        minStart: Number(bound.minStart),
        maxStart: Number(bound.maxStart),
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
      await queue.add(QueueJobs.TraceBatch, data, { jobId: id });
      enqueued++;
    }
  }
  return {
    matched,
    traceIds,
    enqueued,
  };
}
