import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  logger,
  QueueJobs,
  recordIncrement,
  TraceBatchQueue,
  type TraceBatchBackfillEventSchema,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { selectCohortTraceBatches, type PendingTrace } from "./traceBatching";

type BackfillTrace = z.infer<
  typeof TraceBatchBackfillEventSchema
>["payload"]["traces"][number];

/**
 * Enqueues traces selected outside the readiness map as backfill trace-batch
 * jobs, packed with the dispatcher's strategy and limits. Each trace is due at
 * its latest observation start, so packing groups traces that are close in
 * time. Traces over a per-trace size limit are dropped, as the dispatcher
 * drops them. Returns the number of jobs.
 */
export async function enqueueTraceBatchBackfill(
  traces: readonly BackfillTrace[],
): Promise<number> {
  if (traces.length === 0) return 0;
  const queue = TraceBatchQueue.getInstance();
  if (!queue)
    throw new Error(
      "Trace batch queue is unavailable. NEXT_PUBLIC_LANGFUSE_CLOUD_REGION must be set in this process.",
    );
  const cohort = traces.map<PendingTrace>(({ estimates, ...trace }) => ({
    member: JSON.stringify([trace.projectId, trace.traceId]),
    due: trace.maxStart,
    estimates,
    trace,
  }));
  const { batches, excluded } = selectCohortTraceBatches(cohort);
  for (const { entry, reason } of excluded) {
    recordIncrement("langfuse.trace_batch.excluded_traces", 1, {
      reason,
      strategy: env.LANGFUSE_TRACE_BATCH_STRATEGY,
    });
    logger.warn("Trace batch backfill excluded oversized trace", {
      projectId: entry.trace.projectId,
      traceId: entry.trace.traceId,
      reason,
    });
  }
  for (const batch of batches) {
    const jobTraces = batch.map(({ trace }) => trace);
    const id = createHash("sha256")
      .update(JSON.stringify(["backfill", jobTraces]))
      .digest("hex");
    await queue.add(
      QueueJobs.TraceBatch,
      {
        id,
        timestamp: new Date(),
        name: QueueJobs.TraceBatch,
        origin: "backfill",
        payload: { traces: jobTraces },
      },
      { jobId: id },
    );
  }
  return batches.length;
}
