#!/usr/bin/env -S tsx
/**
 * One-off remediation that reactivates monitors paused at ERROR_BAD_QUERY,
 * for use after a fix stops a transient failure from flipping them there.
 *
 * Reactivating sets severity to UNKNOWN (rendered as "pending" in the UI) and
 * jitters each monitor's first run across --jitter-minutes so their queries
 * don't all re-fire in one scheduler tick; the default keeps the pending
 * window short. Deploy the flip fix first, or the next failure re-pauses them.
 *
 * Point DATABASE_URL at the target env (via tunnel), dry-run, then --apply:
 *
 * USAGE:
 *   pnpm --filter=worker retry-monitor-bad-query-errors
 *   pnpm --filter=worker retry-monitor-bad-query-errors --apply
 *   pnpm --filter=worker retry-monitor-bad-query-errors --apply --jitter-minutes=30
 */

import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

/** defaultJitterMinutes spreads the reactivated monitors' first run over this window, kept short so the UNKNOWN "pending" state clears within ~15 minutes. */
const defaultJitterMinutes = 15;

/** retryMonitorBadQueryErrors reactivates every monitor stuck in ERROR_BAD_QUERY, mirroring the service resume transition and jittering the first run. */
async function retryMonitorBadQueryErrors(args: {
  apply: boolean;
  jitterMinutes: number;
}): Promise<void> {
  const preview = await countStuckMonitors();
  logger.info(
    `retryMonitorBadQueryErrors: ${preview.monitors} monitors in ERROR_BAD_QUERY across ${preview.queryShapes} query shapes (apply=${args.apply}, jitterMinutes=${args.jitterMinutes})`,
  );

  if (!args.apply) {
    logger.info("retryMonitorBadQueryErrors: dry run, pass --apply to execute");
    return;
  }

  const reactivated = await prisma.$executeRaw`
    UPDATE monitors
    SET status = 'ACTIVE',
        severity = 'UNKNOWN',
        severity_changed_at = now(),
        next_run_at = now() + random() * make_interval(mins => ${args.jitterMinutes}::int),
        last_published_at = NULL,
        last_completed_at = NULL,
        last_claimed_at = NULL,
        alerted_at = NULL
    WHERE status = 'ERROR_BAD_QUERY'
  `;
  logger.info(
    `retryMonitorBadQueryErrors: reactivated ${reactivated} monitors`,
  );
}

/** countStuckMonitors returns how many ERROR_BAD_QUERY monitors exist and how many distinct query shapes they collapse into. */
async function countStuckMonitors(): Promise<{
  monitors: number;
  queryShapes: number;
}> {
  const [row] = await prisma.$queryRaw<
    { monitors: bigint; query_shapes: bigint }[]
  >`
    SELECT count(*) AS monitors,
           count(DISTINCT (project_id, scheduler_batch_id)) AS query_shapes
    FROM monitors
    WHERE status = 'ERROR_BAD_QUERY'
  `;
  return {
    monitors: Number(row?.monitors ?? 0),
    queryShapes: Number(row?.query_shapes ?? 0),
  };
}

/** parseArgs reads --apply and --jitter-minutes from argv. */
function parseArgs(argv: string[]): { apply: boolean; jitterMinutes: number } {
  const apply = argv.includes("--apply");
  const jitterArg = argv
    .find((a) => a.startsWith("--jitter-minutes="))
    ?.split("=")[1];
  const parsed = jitterArg === undefined ? NaN : Number(jitterArg);
  const jitterMinutes =
    Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultJitterMinutes;
  return { apply, jitterMinutes };
}

if (require.main === module) {
  retryMonitorBadQueryErrors(parseArgs(process.argv.slice(2)))
    .catch((err) => {
      logger.error("retryMonitorBadQueryErrors failed", { err });
      process.exit(1);
    })
    .finally(() => process.exit(0));
}

export const __test = { parseArgs };
