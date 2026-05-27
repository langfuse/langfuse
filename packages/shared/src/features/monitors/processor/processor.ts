import { Prisma, type PrismaClient } from "../../../db";
import { monitorProcessorTtl } from "../scheduler/scheduler";
import type { MonitorQueueEvent } from "../scheduler/types";
import type { MonitorSeverity } from "../types";

/** MonitorCompletion is one row of the bulk-update emitted by the state machine — what to write back to a single monitor after evaluation. */
export type MonitorCompletion = {
  monitorId: string;
  lastCompletedRunAt: Date;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
};

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

  /** complete writes the post-evaluation lifecycle stamps for every monitor in the batch in one statement. */
  async complete(args: {
    projectId: string;
    completions: MonitorCompletion[];
  }): Promise<void> {
    if (args.completions.length === 0) return;
    await this.db.$executeRaw(
      buildCompleteQuery({
        projectId: args.projectId,
        completions: args.completions,
      }),
    );
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

/** buildCompleteQuery returns the bulk UPDATE that lands every monitor's post-evaluation stamps via a VALUES-join. */
function buildCompleteQuery(args: {
  projectId: string;
  completions: MonitorCompletion[];
}): Prisma.Sql {
  const valueRows = Prisma.join(
    args.completions.map(
      (c) =>
        Prisma.sql`(${c.monitorId}, ${c.lastCompletedRunAt}::timestamptz, ${c.severity}::"MonitorSeverity", ${c.severityChangedAt}::timestamptz, ${c.alertedAt}::timestamptz)`,
    ),
    ", ",
  );
  return Prisma.sql`
    UPDATE monitors AS m
    SET
      last_completed_run_at = data.last_completed_run_at,
      severity = data.severity,
      severity_changed_at = data.severity_changed_at,
      alerted_at = data.alerted_at
    FROM (VALUES ${valueRows}) AS data(
      id,
      last_completed_run_at,
      severity,
      severity_changed_at,
      alerted_at
    )
    WHERE m.id = data.id
      AND m.project_id = ${args.projectId}
  `;
}
