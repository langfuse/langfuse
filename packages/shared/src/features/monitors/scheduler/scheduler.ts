import type { MonitorView as PrismaMonitorView } from "@prisma/client";
import type { z } from "zod";

import { Prisma, type PrismaClient } from "../../../db";
import type { singleFilter } from "../../../interfaces/filters";
import type { metric as MetricSchema } from "../../query/types";
import { viewFromPrisma, windowFromMs } from "../service/helpers";
import type { MonitorQueueEvent } from "./types";

/** monitorProcessorTtl bounds how long a published run can be in flight before the scheduler republishes it. */
export const monitorProcessorTtl = 5 * 60 * 1000;

type Metric = z.infer<typeof MetricSchema>;
type FilterState = z.infer<typeof singleFilter>[];

type PublishMonitorEvents = (events: MonitorQueueEvent[]) => Promise<void>;

/** MonitorScheduler claims and publishes due monitors for its scheduler slot. */
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

  /**
   * schedule returns messages to queue for the current due monitors and
   * advances the schedule to the next run.
   */
  async schedule(scheduledAt: Date): Promise<number> {
    const rows = await this.db.$queryRaw<MonitorBatchRow[]>(
      buildScheduleQuery({
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

/** MonitorBatchRow is one published batch keyed by (project_id, scheduler_batch_id). */
type MonitorBatchRow = {
  project_id: string;
  scheduler_batch_id: bigint;
  run_at: Date;
  view: PrismaMonitorView;
  filters: FilterState;
  window_ms: bigint;
  metrics: Metric[];
  monitors: { monitorId: string; metricName: string }[];
};

/** toMonitorQueueEvent converts a MonitorBatchRow into its wire-shape MonitorQueueEvent. */
function toMonitorQueueEvent(row: MonitorBatchRow): MonitorQueueEvent {
  return {
    projectId: row.project_id,
    schedulerBatchId: row.scheduler_batch_id,
    runAt: row.run_at,
    view: viewFromPrisma(row.view),
    filters: row.filters,
    window: windowFromMs(row.window_ms),
    metrics: row.metrics,
    monitors: row.monitors,
  };
}

/** buildScheduleQuery returns the SQL that claims due monitors, advances next_run_at, and aggregates published rows by (project_id, scheduler_batch_id). */
function buildScheduleQuery({
  tick,
  schedulerId,
  totalSchedulers,
}: {
  tick: Date;
  schedulerId: number;
  totalSchedulers: number;
}): Prisma.Sql {
  /** calculateNextRunAt computes the next deterministic cadence boundary strictly after tick. */
  const calculateNextRunAt = Prisma.sql`
    TIMESTAMPTZ 'epoch' + (
      (
        ((EXTRACT(EPOCH FROM ${tick}::timestamptz) * 1000)::bigint
          - (due.scheduler_batch_id % 60) * 1000) -- ms since the begining of time
          / due.cadence_ms * due.cadence_ms -- rounded down to the last cadence
        + (due.scheduler_batch_id % 60) * 1000 -- plus some second jitter for better load distibution
        + due.cadence_ms -- advanced to the next cadence
      ) * INTERVAL '1 millisecond'
    )
  `;

  /** runIsPending is true when a prior publish has not completed within monitorProcessorTtl. */
  const runIsPending = Prisma.sql`
    due.last_published_run_at IS NOT NULL -- not the first run
    AND (
      due.last_completed_run_at IS NULL -- worker never reported completion
      OR due.last_completed_run_at < due.last_published_run_at -- last run still in flight
    )
    AND ${tick}::timestamptz - due.last_published_run_at
      <= ${monitorProcessorTtl} * INTERVAL '1 millisecond' -- before TTL
  `;

  return Prisma.sql`
    WITH due AS (
      SELECT
        id,
        project_id,
        scheduler_batch_id,
        cadence_ms,
        view,
        filters,
        window_ms,
        metric,
        last_published_run_at,
        last_completed_run_at,
        status,
        COALESCE(next_run_at, ${tick}::timestamptz) AS run_at
      FROM monitors
      WHERE (next_run_at IS NULL OR next_run_at <= ${tick})
        -- Only take monitors for this scheduler 
        AND (scheduler_batch_id % ${totalSchedulers}::bigint) = ${schedulerId}::bigint
        AND status = 'ACTIVE'
      ORDER BY next_run_at ASC NULLS FIRST
      FOR UPDATE SKIP LOCKED
    ),
    -- Advance all active monitors to the next run
    -- Publish only if another run isn't already pending
    updated AS (
      UPDATE monitors
      SET
        next_run_at = ${calculateNextRunAt},
        last_published_run_at = CASE
          WHEN ${runIsPending} THEN monitors.last_published_run_at
          ELSE due.run_at
        END
      FROM due
      WHERE monitors.id = due.id
      RETURNING
        monitors.id,
        due.project_id,
        due.scheduler_batch_id,
        due.run_at,
        due.view,
        due.filters,
        due.window_ms,
        due.metric,
        NOT (${runIsPending}) AS was_published
    )
    -- Rollup published runs into a message queue event
    SELECT
      project_id,
      scheduler_batch_id,
      MAX(run_at)                  AS run_at,
      (array_agg(view))[1]         AS view,
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
    ORDER BY MAX(run_at) ASC
  `;
}
