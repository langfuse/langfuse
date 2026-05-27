import { Prisma, type PrismaClient } from "../../../db";
import { executeQuery } from "../../query/server/queryExecutor";
import type { QueryType } from "../../query/types";
import { monitorProcessorTtl } from "../scheduler/scheduler";
import type {
  MonitorQueueEvent,
  MonitorWebhookQueueEvent,
} from "../scheduler/types";
import { windowToMs } from "../service/helpers";
import type { MonitorNoData, MonitorRenotify, MonitorSeverity } from "../types";
import { applyStateMachine } from "./applyStateMachine";
import { computeSeverity } from "./computeSeverity";

/** MonitorCompletion is one row of the bulk-update emitted by the state machine — what to write back to a single monitor after evaluation. */
export type MonitorCompletion = {
  monitorId: string;
  lastCompletedRunAt: Date;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
};

/** MonitorPublisher publishes one MonitorWebhookQueueEvent per surviving Monitor alert; wired up by the worker. */
export type MonitorPublisher = (
  event: MonitorWebhookQueueEvent,
) => Promise<void>;

/** MonitorProcessor consumes MonitorQueueEvents, evaluates the severity state machine, and emits monitor alerts. */
export class MonitorProcessor {
  private readonly db: PrismaClient;
  // Constructor seam; commit 2 wires the trigger filter + publisher emit.
  private readonly publish: MonitorPublisher;

  constructor(deps: { db: PrismaClient; publish: MonitorPublisher }) {
    this.db = deps.db;
    this.publish = deps.publish;
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

  /** process orchestrates one MonitorQueueEvent: claim, query CH, apply the state machine per monitor, and complete. The trigger filter + publisher emit are wired in commit 2. */
  async process(event: MonitorQueueEvent, now: Date): Promise<void> {
    const claimedIds = await this.claim(event, now);
    if (claimedIds.length === 0) return;

    const [chRows, rows] = await Promise.all([
      executeQuery(event.projectId, buildMonitorQuery(event)),
      this.db.monitor.findMany({
        where: { id: { in: claimedIds }, projectId: event.projectId },
      }),
    ]);

    const chRow = (chRows[0] ?? {}) as Record<string, unknown>;
    const metricByMonitor = new Map(
      event.monitors.map((m) => [m.monitorId, m.metricName]),
    );

    const completions: MonitorCompletion[] = [];
    for (const row of rows) {
      const metricName = metricByMonitor.get(row.id);
      if (!metricName) continue;
      const computed = computeSeverity({
        value: parseNumericValue(chRow[metricName]),
        operator: row.thresholdOperator,
        alertThreshold: row.alertThreshold.toNumber(),
        warningThreshold: row.warningThreshold?.toNumber() ?? null,
      });
      const decision = applyStateMachine({
        prevSeverity: row.severity,
        computedSeverity: computed,
        prevSeverityChangedAt: row.severityChangedAt,
        prevAlertedAt: row.alertedAt,
        scheduledAt: event.runAt,
        noData: row.noData as unknown as MonitorNoData,
        renotify: row.renotify as unknown as MonitorRenotify,
      });
      completions.push({
        monitorId: row.id,
        lastCompletedRunAt: event.runAt,
        severity: decision.nextSeverity,
        severityChangedAt: decision.nextSeverityChangedAt,
        alertedAt: decision.nextAlertedAt,
      });
      // commit 2 will branch on decision.emit here to filter triggers and publish.
    }

    // commit 2 will publish surviving alerts before complete.
    void this.publish;

    await this.complete({ projectId: event.projectId, completions });
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

/** buildMonitorQuery converts a MonitorQueueEvent into the scalar-shape QueryType `executeQuery` accepts (no dimensions, no time bucketing; window derived from event). */
function buildMonitorQuery(event: MonitorQueueEvent): QueryType {
  const windowMs = Number(windowToMs(event.window));
  const fromTimestamp = new Date(event.runAt.getTime() - windowMs);
  return {
    view: event.view,
    dimensions: [],
    metrics: event.metrics,
    filters: event.filters,
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: event.runAt.toISOString(),
    orderBy: null,
  };
}

/** parseNumericValue safely coerces a ClickHouse-returned cell to number | null. Missing/non-finite values become null so they flow into computeSeverity as NO_DATA. */
function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
