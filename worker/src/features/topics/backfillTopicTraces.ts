import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueJobs,
  TraceBatchEventSchema,
  TraceBatchQueue,
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
  for (const trace of rows) {
    const minStart = Number(trace.timestampMs);
    const maxStart = Math.max(minStart, Number(trace.latestMs));
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
    await queue.add(QueueJobs.TraceBatch, data, { jobId: id });
  }
  return {
    matched,
    traceIds,
    enqueued: rows.length,
  };
}
