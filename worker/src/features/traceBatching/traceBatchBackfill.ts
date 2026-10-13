import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  QueueJobs,
  TraceBatchQueue,
  type TraceBatchTraceSchema,
} from "@langfuse/shared/src/server";
import { selectCohortTraceBatches, type PendingTrace } from "./traceBatching";

type TraceBatchTrace = z.infer<typeof TraceBatchTraceSchema>;

/**
 * Enqueues traces selected outside the readiness map as ordinary trace-batch
 * jobs, packed with the dispatcher's strategy. Every trace is due now, so the
 * strategy alone decides the grouping. Returns the number of jobs.
 */
export async function enqueueTraceBatchBackfill(
  traces: readonly TraceBatchTrace[],
): Promise<number> {
  if (traces.length === 0) return 0;
  const queue = TraceBatchQueue.getInstance();
  if (!queue)
    throw new Error(
      "Trace batch queue is unavailable. NEXT_PUBLIC_LANGFUSE_CLOUD_REGION must be set in this process.",
    );
  const due = Date.now();
  const cohort = traces.map<PendingTrace>((trace) => ({
    member: JSON.stringify([trace.projectId, trace.traceId]),
    due,
    trace,
  }));
  const batches = selectCohortTraceBatches(cohort);
  for (const batch of batches) {
    const jobTraces = batch.map(({ trace }) => trace);
    const id = createHash("sha256")
      .update(JSON.stringify(jobTraces))
      .digest("hex");
    await queue.add(
      QueueJobs.TraceBatch,
      {
        id,
        timestamp: new Date(),
        name: QueueJobs.TraceBatch,
        payload: { traces: jobTraces },
      },
      { jobId: id },
    );
  }
  return batches.length;
}
