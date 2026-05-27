import { Prisma, type PrismaClient } from "../../../db";
import { monitorProcessorTtl } from "../scheduler/scheduler";
import type { MonitorQueueEvent } from "../scheduler/types";

/** MonitorProcessor consumes MonitorQueueEvents, evaluates the severity state machine, and emits monitor alerts. */
export class MonitorProcessor {
  private readonly db: PrismaClient;

  constructor(deps: { db: PrismaClient }) {
    this.db = deps.db;
  }

  /** claim attempts to lock the monitors in the event for this worker. Returns the ids that were locked. */
  async claim(event: MonitorQueueEvent, now: Date): Promise<string[]> {
    if (event.monitors.length === 0) return [];
    const monitorIds = event.monitors.map((m) => m.monitorId);
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      buildClaimQuery({
        projectId: event.projectId,
        runAt: event.runAt,
        monitorIds,
        now,
      }),
    );
    return rows.map((r) => r.id);
  }
}

/** buildClaimQuery returns the conditional UPDATE that takes ownership of a published run and rejects stale, completed, or in-flight ones. */
function buildClaimQuery(args: {
  projectId: string;
  runAt: Date;
  monitorIds: string[];
  now: Date;
}): Prisma.Sql {
  return Prisma.sql`
    UPDATE monitors
    SET last_claimed_run_at = ${args.runAt}
    WHERE id = ANY(${args.monitorIds})
      AND project_id = ${args.projectId}
      -- clause 1: this row's published run matches the event
      AND last_published_run_at = ${args.runAt}
      -- clause 2: the published run isn't already complete
      AND (
        last_completed_run_at IS NULL
        OR last_completed_run_at < last_published_run_at
      )
      -- clause 3: no live claim on this publish (NULL, prior run, or TTL expired)
      AND (
        last_claimed_run_at IS NULL
        OR last_claimed_run_at < last_published_run_at
        OR ${args.now}::timestamptz - last_published_run_at
             > ${monitorProcessorTtl} * INTERVAL '1 millisecond'
      )
    RETURNING id
  `;
}
