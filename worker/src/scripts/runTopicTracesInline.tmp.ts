// Temporary experiment runner: processes the backfill selection inline through
// the real trace-batch processor instead of the queue, a few traces at a time.
import { topicTraceSelectionCriteriaSchema } from "@langfuse/shared/topics";
import { traceBatchQueueProcessor } from "../queues/traceBatchQueue";
import {
  backfillSelectionFilters,
  enqueueTopicTraceBackfill,
} from "../features/topics/backfillTopicTraces";

const TAG = process.env.EVAL_TAG ?? "eval-100";
const LIMIT = process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : null;
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);
// Optional fixed trace set, one ID per line; tags drift across re-imports.
const IDS = process.env.EVAL_TRACE_IDS_FILE
  ? new Set(
      require("node:fs")
        .readFileSync(process.env.EVAL_TRACE_IDS_FILE, "utf8")
        .split("\n")
        .filter(Boolean),
    )
  : null;

async function main() {
  const processor = traceBatchQueueProcessor;
  const jobs: { traceId: string; run: () => Promise<void> }[] = [];
  await enqueueTopicTraceBackfill({
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    apply: true,
    selection: topicTraceSelectionCriteriaSchema.parse({
      from: "2026-09-24T07:28:54Z",
      to: "2026-09-24T15:28:54Z",
      sampling: "latest",
      seed: "backfill",
      limit: LIMIT,
      filter: backfillSelectionFilters({
        traceNames: [],
        tags: [TAG],
        extra: [],
      }),
    }),
    addJob: async (_name, data, { jobId }) => {
      const trace = (data as any).payload.traces[0];
      // Backfill derives the read window from matching rows only (the tagged
      // root); widen it so the whole trace is read.
      trace.maxStart = trace.minStart + 60 * 60_000;
      if (process.env.EVAL_TRACE && trace.traceId !== process.env.EVAL_TRACE)
        return;
      if (IDS && !IDS.has(trace.traceId)) return;
      jobs.push({
        traceId: trace.traceId,
        run: () =>
          processor(
            { id: jobId, data, attemptsMade: 0, opts: {} } as never,
            undefined,
          ) as Promise<void>,
      });
    },
  });
  // Up to three passes; completed facets are skipped on retry, so a retry only
  // redoes the facets a transient failure left out.
  let pending = jobs;
  for (let pass = 1; pass <= 3 && pending.length; pass++) {
    const failed: typeof jobs = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < pending.length) {
          const job = pending[next++];
          try {
            await job.run();
            console.log(`pass${pass} ok ${job.traceId}`);
          } catch (e) {
            const error = e as Error & { reason?: string };
            // The input limit is deterministic; don't retry it.
            if (!/input limit/.test(error.message)) failed.push(job);
            console.log(
              `pass${pass} FAIL ${job.traceId} [${error.reason ?? error.name}]: ${String(error.message).slice(0, 160)}`,
            );
          }
        }
      }),
    );
    pending = failed;
  }
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
