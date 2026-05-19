import { Prisma } from "../../../db";
import type { PrismaClient } from "../../../db";
import type { singleFilter } from "../../../interfaces/filters";
import type { metric as MetricSchema } from "../../query/types";
import type { MonitorQueueEvent } from "../types";
import type { z } from "zod";

type Metric = z.infer<typeof MetricSchema>;
type FilterState = z.infer<typeof singleFilter>[];

type PublishMonitorEvents = (events: MonitorQueueEvent[]) => Promise<void>;

/**
 * MonitorScheduler claims due monitor rows for its slot, advances `nextRunAt`
 * for every claimed row, gate-publishes ACTIVE rows that aren't already
 * pending evaluation (or that crossed the 5-minute TTL), groups the published
 * rows by `schedulerBatchId`, and emits one `MonitorQueueEvent` per group via
 * the injected `publish` callback.
 */
export class MonitorScheduler {
  private readonly schedulerId: number;
  private readonly totalSchedulers: number;
  private readonly db: PrismaClient;
  private readonly publish: PublishMonitorEvents;

  constructor(deps: {
    schedulerId: number;
    totalSchedulers: number;
    db: PrismaClient;
    publish: PublishMonitorEvents;
  }) {
    this.schedulerId = deps.schedulerId;
    this.totalSchedulers = deps.totalSchedulers;
    this.db = deps.db;
    this.publish = deps.publish;
  }

  async tick(scheduledAt: Date): Promise<number> {
    const rows = await this.db.$queryRaw<MonitorBatchRow[]>(
      buildTickQuery({
        tick: scheduledAt,
        schedulerId: this.schedulerId,
        totalSchedulers: this.totalSchedulers,
      }),
    );

    if (rows.length === 0) return 0;

    const events = rows.map(toMonitorQueueEvent);
    await this.publish(events);
    return events.length;
  }
}

type MonitorBatchRow = {
  project_id: string;
  scheduler_batch_id: bigint;
  scheduled_at: Date;
  view: string;
  filters: FilterState;
  window_ms: bigint;
  metrics: Metric[];
  monitors: { monitorId: string; metricName: string }[];
};

function toMonitorQueueEvent(row: MonitorBatchRow): MonitorQueueEvent {
  return {
    projectId: row.project_id,
    schedulerBatchId: row.scheduler_batch_id,
    scheduledAt: row.scheduled_at,
    view: row.view as MonitorQueueEvent["view"],
    filters: row.filters,
    window: row.window_ms,
    metrics: row.metrics,
    monitors: row.monitors,
  };
}

/**
 * Two-stage CTE per RFC §Example SQL, collapsed to one UPDATE because
 * Postgres forbids modifying the same row twice in a single statement
 * (advance_schedule + publish would both touch `monitors.id`). Equivalent
 * semantics — advance always, publish only when the gate passes:
 *   - `due`: SELECT FOR UPDATE SKIP LOCKED claims this slot's due rows
 *   - `updated`: single UPDATE that advances `next_run_at` for every claimed
 *     row and conditionally stamps `last_published_run_at` for rows that pass
 *     the ACTIVE + (first-run OR prior-run-done OR 5-min-TTL) gate. The
 *     `was_published` boolean is echoed back so the final SELECT can filter.
 * Final SELECT groups by `(project_id, scheduler_batch_id)`.
 */
function buildTickQuery({
  tick,
  schedulerId,
  totalSchedulers,
}: {
  tick: Date;
  schedulerId: number;
  totalSchedulers: number;
}): Prisma.Sql {
  const publishGate = Prisma.sql`
    due.status = 'ACTIVE'
    AND (
      due.last_published_run_at IS NULL
      OR due.last_completed_run_at >= due.last_published_run_at
      OR ${tick}::timestamptz - due.last_published_run_at > interval '5 minutes'
    )
  `;

  return Prisma.sql`
    WITH due AS (
      SELECT
        id,
        project_id,
        scheduler_batch_id,
        next_run_at AS scheduled_at,
        cadence_ms,
        view,
        filters,
        window_ms,
        metric,
        last_published_run_at,
        last_completed_run_at,
        status
      FROM monitors
      WHERE next_run_at <= ${tick}
        AND (scheduler_batch_id % ${totalSchedulers}::bigint) = ${schedulerId}::bigint
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
    ),
    updated AS (
      UPDATE monitors
      SET
        next_run_at = monitors.next_run_at + (due.cadence_ms * interval '1 millisecond'),
        last_published_run_at = CASE
          WHEN ${publishGate} THEN due.scheduled_at
          ELSE monitors.last_published_run_at
        END
      FROM due
      WHERE monitors.id = due.id
      RETURNING
        monitors.id,
        due.project_id,
        due.scheduler_batch_id,
        due.scheduled_at,
        due.view,
        due.filters,
        due.window_ms,
        due.metric,
        (${publishGate}) AS was_published
    )
    SELECT
      project_id,
      scheduler_batch_id,
      MAX(scheduled_at)            AS scheduled_at,
      (array_agg(view::text))[1]   AS view,
      (array_agg(filters))[1]      AS filters,
      (array_agg(window_ms))[1]    AS window_ms,
      array_agg(DISTINCT metric)   AS metrics,
      array_agg(
        jsonb_build_object(
          'monitorId', id,
          'metricName', concat(metric->>'aggregation', '_', metric->>'measure')
        )
        ORDER BY id
      ) AS monitors
    FROM updated
    WHERE was_published = true
    GROUP BY project_id, scheduler_batch_id
    ORDER BY MAX(scheduled_at) ASC
  `;
}
