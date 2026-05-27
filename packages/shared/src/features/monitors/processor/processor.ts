import type { Monitor as PrismaMonitor } from "@prisma/client";

import { JobConfigState, Prisma, type PrismaClient } from "../../../db";
import { env } from "../../../env";
import { TriggerEventSource } from "../../../domain/automations";
import { matchesTriggerFilter } from "../../../server/automations";
import {
  getTriggerConfigurations,
  type TriggerDomainWithActions,
} from "../../../server/repositories/automation-repository";
import { executeQuery } from "../../query/server/queryExecutor";
import type { QueryType } from "../../query/types";
import { monitorProcessorTtl } from "../scheduler/scheduler";
import type {
  MonitorQueueEvent,
  MonitorWebhookQueueEvent,
} from "../scheduler/types";
import { windowToMs } from "../service/helpers";
import type {
  MonitorAlert,
  MonitorNoData,
  MonitorRenotify,
  MonitorSeverity,
  MonitorThresholdOperator,
  MonitorView,
  MonitorWindow,
} from "../types";
import { applyStateMachine } from "./applyStateMachine";
import { computeSeverity } from "./computeSeverity";

/** MonitorCompletion is one row of the bulk-update emitted by the state machine — what to write back to a single monitor after evaluation. */
export type MonitorCompletion = {
  monitorId: string;
  lastCompletedAt: Date;
  severity: MonitorSeverity;
  severityChangedAt: Date | null;
  alertedAt: Date | null;
};

/** MonitorPublisher publishes one MonitorWebhookQueueEvent per surviving Monitor alert; wired up by the worker. */
export type MonitorPublisher = (
  event: MonitorWebhookQueueEvent,
) => Promise<void>;

/** MonitorQueryExecutor runs the scalar-shape ClickHouse query for a monitor evaluation; injected so tests can fake CH responses. */
export type MonitorQueryExecutor = (
  projectId: string,
  query: QueryType,
) => Promise<Array<Record<string, unknown>>>;

/** MonitorTriggerLoader loads the Monitor-source trigger configurations for a project; injected so tests can fake trigger sets. */
export type MonitorTriggerLoader = (
  projectId: string,
) => Promise<TriggerDomainWithActions[]>;

/** defaultMonitorTriggerLoader is the production wiring: load ACTIVE Monitor-source triggers for the project. */
export const defaultMonitorTriggerLoader: MonitorTriggerLoader = (projectId) =>
  getTriggerConfigurations({
    projectId,
    eventSource: TriggerEventSource.Monitor,
    status: JobConfigState.ACTIVE,
  });

/** defaultMonitorQueryExecutor is the production wiring: forward to the shared ClickHouse executeQuery. */
export const defaultMonitorQueryExecutor: MonitorQueryExecutor = (
  projectId,
  query,
) => executeQuery(projectId, query);

/** MonitorProcessor consumes MonitorQueueEvents, evaluates the severity state machine, and emits monitor alerts. */
export class MonitorProcessor {
  private readonly db: PrismaClient;
  private readonly publish: MonitorPublisher;
  private readonly executeQuery: MonitorQueryExecutor;
  private readonly getTriggers: MonitorTriggerLoader;

  constructor(deps: {
    db: PrismaClient;
    publish: MonitorPublisher;
    executeQuery?: MonitorQueryExecutor;
    getTriggers?: MonitorTriggerLoader;
  }) {
    this.db = deps.db;
    this.publish = deps.publish;
    this.executeQuery = deps.executeQuery ?? defaultMonitorQueryExecutor;
    this.getTriggers = deps.getTriggers ?? defaultMonitorTriggerLoader;
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

  /** process orchestrates one MonitorQueueEvent: claim, query CH, load triggers, apply the state machine per monitor, publish surviving alerts (before commit per RFC step 9), and complete. */
  async process(event: MonitorQueueEvent, now: Date): Promise<void> {
    const claimedIds = await this.claim(event, now);
    if (claimedIds.length === 0) return;

    const [chRows, triggers, rows] = await Promise.all([
      this.executeQuery(event.projectId, buildMonitorQuery(event)),
      this.getTriggers(event.projectId),
      this.db.monitor.findMany({
        where: { id: { in: claimedIds }, projectId: event.projectId },
      }),
    ]);

    const chRow = (chRows[0] ?? {}) as Record<string, unknown>;
    const metricByMonitor = new Map(
      event.monitors.map((m) => [m.monitorId, m]),
    );

    const completions: MonitorCompletion[] = [];
    const alertsToPublish: MonitorWebhookQueueEvent[] = [];
    for (const row of rows) {
      const eventMonitor = metricByMonitor.get(row.id);
      if (!eventMonitor) continue;
      const computed = computeSeverity({
        value: parseNumericValue(chRow[eventMonitor.metricName]),
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
        lastCompletedAt: event.runAt,
        severity: decision.nextSeverity,
        severityChangedAt: decision.nextSeverityChangedAt,
        alertedAt: decision.nextAlertedAt,
      });
      if (!decision.emit) continue;

      const alert = buildAlert({
        row,
        prevSeverity: row.severity,
        severity: decision.nextSeverity,
        event,
      });
      const filterData = toFilterData(row, alert);
      const matched = triggers.some((t) => matchesTriggerFilter(filterData, t));
      if (!matched) continue;
      alertsToPublish.push({
        type: "monitor-alert",
        version: "v1",
        payload: alert,
      });
    }

    // RFC step 9: publish before complete so a tx failure prefers double-alert over lost-alert.
    for (const alertEvent of alertsToPublish) {
      await this.publish(alertEvent);
    }
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
    SET last_claimed_at = ${args.runAt}
    WHERE id = ANY(${args.monitorIds})
      AND project_id = ${args.projectId}
      -- clause 1: this row's published run matches the event
      AND last_published_at = ${args.runAt}
      -- clause 2: the published run isn't already complete
      AND (
        last_completed_at IS NULL
        OR last_completed_at < last_published_at
      )
      -- clause 3: no live claim on this publish (NULL, prior run, or TTL expired)
      AND (
        last_claimed_at IS NULL
        OR last_claimed_at < last_published_at
        OR ${args.now}::timestamptz - last_published_at
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
        Prisma.sql`(${c.monitorId}, ${c.lastCompletedAt}::timestamptz, ${c.severity}::"MonitorSeverity", ${c.severityChangedAt}::timestamptz, ${c.alertedAt}::timestamptz)`,
    ),
    ", ",
  );
  return Prisma.sql`
    UPDATE monitors AS m
    SET
      last_completed_at = data.last_completed_at,
      severity = data.severity,
      severity_changed_at = data.severity_changed_at,
      alerted_at = data.alerted_at
    FROM (VALUES ${valueRows}) AS data(
      id,
      last_completed_at,
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

/** buildAlert assembles the MonitorAlert payload from the row, the state-machine outcome, and the originating event. */
function buildAlert(args: {
  row: PrismaMonitor;
  prevSeverity: MonitorSeverity;
  severity: MonitorSeverity;
  event: MonitorQueueEvent;
}): MonitorAlert {
  const eventMonitor = args.event.monitors.find(
    (m) => m.monitorId === args.row.id,
  );
  // Recover the original (measure, aggregation) from event.metrics by matching on metricName.
  const metric = args.event.metrics.find(
    (m) => `${m.aggregation}_${m.measure}` === eventMonitor?.metricName,
  ) ?? { measure: "value", aggregation: "count" };
  return {
    monitorId: args.row.id,
    projectId: args.event.projectId,
    severity: args.severity,
    timestamp: args.event.runAt,
    permalink: buildPermalink(args.event.projectId, args.row.id),
    message: synthesizeAlertMessage({
      monitorName: args.row.name,
      prevSeverity: args.prevSeverity,
      severity: args.severity,
      thresholdOperator: args.row.thresholdOperator,
      alertThreshold: args.row.alertThreshold.toNumber(),
      warningThreshold: args.row.warningThreshold?.toNumber() ?? null,
      measure: metric.measure,
      aggregation: metric.aggregation,
      view: args.event.view,
      window: args.event.window,
    }),
    view: args.event.view,
    filters: args.event.filters,
    window: args.event.window,
  };
}

/** buildPermalink composes the Langfuse Cloud URL for a monitor; falls back to a path-only URL if NEXTAUTH_URL is unset. */
function buildPermalink(projectId: string, monitorId: string): string {
  const base = (env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return `${base}/project/${projectId}/monitors/${monitorId}`;
}

/** synthesizeAlertMessage builds the human-readable title/body for a MonitorAlert. The body distinguishes no-data alerts from threshold-crossing alerts. */
function synthesizeAlertMessage(args: {
  monitorName: string;
  prevSeverity: MonitorSeverity;
  severity: MonitorSeverity;
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
  measure: string;
  aggregation: string;
  view: MonitorView;
  window: MonitorWindow;
}): { title: string; body: string } {
  const title = `[${args.severity}] ${args.monitorName}`;
  const metricRef = `${args.aggregation}(${args.view}.${args.measure})`;
  let body: string;
  if (args.severity === "NO_DATA") {
    body = `${metricRef} has no data over the last ${args.window}`;
  } else if (args.prevSeverity === "NO_DATA" && args.severity === "OK") {
    body = `${metricRef} has data again`;
  } else if (args.severity === "OK") {
    body = `${metricRef} is back within threshold`;
  } else {
    // WARNING or ALERT (whether escalation, de-escalation, recovery from NO_DATA, or self-loop renotify).
    const threshold = selectThreshold(
      args.severity,
      args.alertThreshold,
      args.warningThreshold,
    );
    body = `${metricRef} is ${operatorWord(args.thresholdOperator)} ${threshold}`;
  }
  return { title, body };
}

/** operatorWord returns the human-readable form of a threshold operator. */
function operatorWord(op: MonitorThresholdOperator): string {
  switch (op) {
    case "GT":
      return "above";
    case "GTE":
      return "at or above";
    case "LT":
      return "below";
    case "LTE":
      return "at or below";
    case "EQ":
      return "equal to";
    case "NEQ":
      return "not equal to";
  }
}

/** selectThreshold picks the threshold relevant to the current severity (warning band for WARNING, alert for everything else). */
function selectThreshold(
  severity: MonitorSeverity,
  alertThreshold: number,
  warningThreshold: number | null,
): number {
  if (severity === "WARNING" && warningThreshold !== null) {
    return warningThreshold;
  }
  return alertThreshold;
}

/** toFilterData projects the row + alert into the flat record shape `matchesTriggerFilter` evaluates against trigger filters (severity, tags, monitorId, monitorName). */
function toFilterData(
  row: PrismaMonitor,
  alert: MonitorAlert,
): Record<string, unknown> {
  return {
    severity: alert.severity,
    tags: row.tags,
    monitorId: row.id,
    monitorName: row.name,
  };
}
