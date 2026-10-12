/**
 * Enqueue existing traces onto the trace-batch queue. The running trace-batch
 * worker reads each trace and summarizes it. This process only selects and
 * enqueues.
 *
 * Dry run:
 *   pnpm --filter worker backfill-topic-traces -- \
 *     --project-id=<id> --from=2026-09-23T00:00:00Z --to=2026-09-24T00:00:00Z \
 *     --trace-name=agent-turn --sampling=latest --limit=20
 *
 * Enqueue:
 *   pnpm --filter worker backfill-topic-traces -- \
 *     --project-id=<id> --from=2026-09-23T00:00:00Z --to=2026-09-24T00:00:00Z \
 *     --trace-name=agent-turn --sampling=latest --limit=20 --apply
 *
 * The worker must have NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
 * QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED=true, and
 * LANGFUSE_TRACE_BATCH_READ_ENABLED=true. --sampling=latest keeps the newest
 * matches when --limit is set. Repeat --trace-name and --tag to match any of
 * those values. --filter is a JSON array of Topics observation filters.
 */

import { logger } from "@langfuse/shared/src/server";
import { topicTraceSelectionCriteriaSchema } from "@langfuse/shared/topics";
import { env } from "../env";
import {
  backfillSelectionFilters,
  enqueueTopicTraceBackfill,
} from "../features/topics/backfillTopicTraces";

function values(argv: string[], name: string): string[] {
  const prefix = `--${name}=`;
  return argv
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length));
}

function value(argv: string[], name: string): string | undefined {
  return values(argv, name).at(-1);
}

function parseArgs(argv: string[]) {
  const projectId = value(argv, "project-id");
  const from = value(argv, "from");
  const to = value(argv, "to");
  if (!projectId || !from || !to)
    throw new Error("--project-id, --from, and --to are required.");
  const limitArg = value(argv, "limit");
  const extra = value(argv, "filter");
  return topicTraceSelectionCriteriaSchema.parse({
    from,
    to,
    sampling: value(argv, "sampling") ?? "latest",
    seed: value(argv, "seed") ?? "backfill",
    limit: limitArg === undefined ? null : Number(limitArg),
    filter: backfillSelectionFilters({
      traceNames: values(argv, "trace-name"),
      tags: values(argv, "tag"),
      extra: extra === undefined ? [] : JSON.parse(extra),
    }),
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const projectId = value(argv, "project-id");
  if (!projectId)
    throw new Error("--project-id, --from, and --to are required.");
  if (env.LANGFUSE_TRACE_BATCH_READ_ENABLED !== "true")
    logger.warn(
      "LANGFUSE_TRACE_BATCH_READ_ENABLED is not true in this process. The worker will discard enqueued jobs until it is.",
    );
  if (env.QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED !== "true")
    logger.warn(
      "QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED is not true in this process. The worker will not consume the queue until it is.",
    );
  const result = await enqueueTopicTraceBackfill({
    projectId,
    selection: parseArgs(argv),
    apply,
  });
  logger.info(
    `Topic trace backfill: matched ${result.matched}, selected ${result.traceIds.length}, enqueued ${result.enqueued}.`,
  );
  if (result.traceIds.length > 0)
    logger.info(`Traces: ${result.traceIds.join(", ")}`);
  if (!apply)
    logger.info(
      "Dry run. Pass --apply to enqueue these traces on trace-batch.",
    );
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error("Topic trace backfill failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    },
  );
}
