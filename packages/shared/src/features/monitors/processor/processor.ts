import { randomUUID } from "crypto";

import { JobConfigState, Prisma, type PrismaClient } from "../../../db";
import { env } from "../../../env";
import { TriggerEventSource } from "../../../domain/automations";
import { matchesTriggerFilter } from "../../../server/automations";
import {
  instrumentAsync,
  instrumentSync,
} from "../../../server/instrumentation";
import { logger } from "../../../server/logger";
import {
  getTriggerConfigurations as defaultGetTriggerConfigurations,
  type TriggerDomainWithActions,
} from "../../../server/repositories/automation-repository";
import { executeQuery as defaultExecuteQuery } from "../../query/server/queryExecutor";
import type { QueryType } from "../../query/types";
import { isValidQuery } from "../isValidQuery";
import {
  MonitorQueueEventSchema,
  type MonitorQueueEvent,
  type MonitorQueueEventInput,
  type MonitorWebhookInput,
} from "../scheduler/types";
import { monitorFromPrisma, windowToMs } from "../service/helpers";
import { type MonitorAlert, type MonitorWindow, type Monitor } from "../types";
import { applyStateMachine, type MonitorCompletion } from "./applyStateMachine";
import { computeSeverity } from "./computeSeverity";
import { resolveNoDataSeverity } from "./resolveNoDataSeverity";
import { renderAlertMessage } from "./renderAlertMessage";

/** monitorEvaluationOffsetMs shifts the query window back so ClickHouse reads data settled past the events-table write lag. */
export const monitorEvaluationOffsetMs = 30 * 1000;

/** ErrorBadQuery sentinels a metric whose shape doesn't resolve against the v2 data model or whose batch query failed to execute. */
export const ErrorBadQuery = Symbol("ErrorBadQuery");

/** MonitorProcessor evaluates queued monitor events and emits MonitorAlerts. */
export class MonitorProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly publish: MonitorPublisher,
    private readonly executeQuery: QueryExecutor = defaultExecuteQuery,
    private readonly getTriggerConfigurations: GetTriggerConfigurations = defaultGetTriggerConfigurations,
  ) {}

  /** process evaluates one queued monitor event and publishes any resulting alerts; the input is parsed to recoerce dates the queue serialized to strings. */
  async process(input: MonitorQueueEventInput, now: Date): Promise<void> {
    const event = MonitorQueueEventSchema.parse(input);
    return instrumentAsync({ name: "process" }, async (span) => {
      const monitors = await instrumentAsync({ name: "claimMonitors" }, () =>
        this.claimMonitors(event, now),
      );
      span.setAttribute("monitors", monitors.length);
      if (monitors.length === 0) return;

      const [metrics, triggers] = await Promise.all([
        instrumentAsync({ name: "queryMetrics" }, () =>
          this.queryMetrics(event),
        ),
        instrumentAsync({ name: "getTriggerConfigurations" }, () =>
          this.getTriggerConfigurations({
            projectId: event.projectId,
            eventSource: TriggerEventSource.Monitor,
            status: JobConfigState.ACTIVE,
          }),
        ),
      ]);

      span.setAttribute("metrics", Object.keys(metrics).length);
      span.setAttribute("triggers", triggers.length);

      const [completions, monitorWebhookInputs] = instrumentSync(
        { name: "processMonitors" },
        () =>
          processMonitors({
            monitors,
            metrics,
            triggers,
            now,
            runAt: event.runAt,
            publishedAt: event.publishedAt,
          }),
      );
      span.setAttribute("monitorWebhookInputs", monitorWebhookInputs.length);

      await instrumentAsync({ name: "publishWebhookInputs" }, () =>
        this.publishWebhookInputs(monitorWebhookInputs),
      );

      await instrumentAsync({ name: "complete" }, () =>
        this.complete({ projectId: event.projectId, completions }),
      );
    });
  }

  /** claimMonitors conditionally claims the event's monitors for this worker, returning the rows it won. */
  private async claimMonitors(
    event: MonitorQueueEvent,
    now: Date,
  ): Promise<Monitor[]> {
    if (event.monitors.length === 0) return [];
    const prismaMonitors = await this.db.monitor.updateManyAndReturn({
      where: {
        id: { in: event.monitors.map((m) => m.monitorId) },
        projectId: event.projectId,
        status: "ACTIVE", // active monitors for the
        lastPublishedAt: { lte: event.publishedAt }, // newest event
        AND: [
          // not already claimed
          {
            OR: [
              { lastClaimedAt: null },
              { lastClaimedAt: { lte: event.publishedAt } },
            ],
          },
          // and not yet completed
          {
            OR: [
              { lastCompletedAt: null },
              { lastCompletedAt: { lt: event.publishedAt } },
            ],
          },
        ],
      },
      data: { lastClaimedAt: now },
    });
    return prismaMonitors.map(monitorFromPrisma);
  }

  /** queryMetrics pre-screens the batch's metrics against the v2 data model, runs the accepted ones, and returns each metric keyed by `${aggregation}_${measure}` as a number, null, or the ErrorBadQuery sentinel. */
  private async queryMetrics(event: MonitorQueueEvent): Promise<MetricMap> {
    const validation = isValidQuery({
      view: event.view,
      metrics: event.metrics,
      filters: event.filters,
    });
    const metricMap: MetricMap = {};
    for (const metric of validation.rejected) {
      metricMap[metricKey(metric)] = ErrorBadQuery;
    }
    if (validation.accepted.length === 0) return metricMap;

    try {
      const rows = await this.executeQuery(
        event.projectId,
        buildMonitorQuery(validation.accepted, event),
        "v2",
        true,
      );
      const row = (rows[0] ?? {}) as Record<string, unknown>;
      for (const metric of validation.accepted) {
        const key = metricKey(metric);
        metricMap[key] = parseNumericValue(row[key]);
      }
      metricMap["count_count"] = parseNumericValue(row["count_count"]);
    } catch (error) {
      logger.error(
        "queryMetrics failed; flipping affected monitors to ERROR_BAD_QUERY",
        {
          projectId: event.projectId,
          schedulerBatchId: event.schedulerBatchId.toString(),
          monitorIds: event.monitors.map((m) => m.monitorId),
          error,
        },
      );
      for (const metric of validation.accepted) {
        metricMap[metricKey(metric)] = ErrorBadQuery;
      }
      metricMap["count_count"] = ErrorBadQuery;
    }
    return metricMap;
  }

  private async publishWebhookInputs(
    inputs: MonitorWebhookInput[],
  ): Promise<void> {
    for (const input of inputs) {
      await this.publish(input);
    }
  }

  /** complete writes each monitor's post-evaluation lifecycle stamps in one statement. */
  private async complete(args: {
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

/** buildMonitorQuery converts the accepted metrics of a MonitorQueueEvent into the scalar QueryType executeQuery accepts. */
function buildMonitorQuery(
  acceptedMetrics: QueryType["metrics"],
  event: MonitorQueueEvent,
): QueryType {
  const { fromTimestamp, toTimestamp } = evaluationWindow(
    event.window,
    event.runAt,
  );
  const metrics = dedupeMetrics([
    ...acceptedMetrics,
    { measure: "count", aggregation: "count" as const },
  ]);
  return {
    view: event.view,
    dimensions: [],
    metrics,
    filters: event.filters,
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };
}

/** dedupeMetrics drops duplicate metrics keyed by `${aggregation}_${measure}` so the appended row-count metric never collides with an existing count metric. */
function dedupeMetrics(metrics: QueryType["metrics"]): QueryType["metrics"] {
  const seen = new Set<string>();
  return metrics.filter((m) => {
    const key = metricKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** metricKey is the `${aggregation}_${measure}` column name a metric resolves to in the query result row. */
function metricKey(metric: { measure: string; aggregation: string }): string {
  return `${metric.aggregation}_${metric.measure}`;
}

/** evaluationWindow returns the `[runAt - window, runAt]` edges, both shifted back by monitorEvaluationOffsetMs. */
function evaluationWindow(
  window: MonitorWindow,
  runAt: Date,
): {
  fromTimestamp: Date;
  toTimestamp: Date;
} {
  const windowMs = Number(windowToMs(window));
  const toTimestamp = new Date(runAt.getTime() - monitorEvaluationOffsetMs);
  const fromTimestamp = new Date(toTimestamp.getTime() - windowMs);
  return { fromTimestamp, toTimestamp };
}

/** parseNumericValue coerces a ClickHouse cell to number | null, mapping missing or non-finite values to null. */
function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** processMonitors evaluates every claimed monitor, collecting the completions to persist and the webhook inputs to publish. */
function processMonitors(args: {
  monitors: Monitor[];
  metrics: MetricMap;
  triggers: TriggerDomainWithActions[];
  now: Date;
  runAt: Date;
  publishedAt: Date;
}): [MonitorCompletion[], MonitorWebhookInput[]] {
  const completions: MonitorCompletion[] = [];
  const monitorWebhookInputs: MonitorWebhookInput[] = [];
  for (const monitor of args.monitors) {
    const [completion, inputs] = processMonitor({
      monitor,
      metrics: args.metrics,
      triggers: args.triggers,
      now: args.now,
      runAt: args.runAt,
      publishedAt: args.publishedAt,
    });
    completions.push(completion);
    monitorWebhookInputs.push(...inputs);
  }
  return [completions, monitorWebhookInputs];
}

/** processMonitor evaluates one monitor and returns its lifecycle completion plus any webhook inputs to publish; a bad-query metric short-circuits to an ERROR_BAD_QUERY completion with no alert. */
function processMonitor(args: {
  monitor: Monitor;
  metrics: MetricMap;
  triggers: TriggerDomainWithActions[];
  now: Date;
  runAt: Date;
  publishedAt: Date;
}): [MonitorCompletion, MonitorWebhookInput[]] {
  const { monitor, metrics, triggers, now, runAt, publishedAt } = args;
  const value = getMetricValue(metrics, monitor.metric);
  if (value === ErrorBadQuery) {
    return [
      {
        monitorId: monitor.id,
        lastClaimedAt: now,
        lastCompletedAt: now,
        publishedAt,
        status: "ERROR_BAD_QUERY",
        severity: "PAUSED",
        severityChangedAt: now,
        alertedAt: monitor.alertedAt,
      },
      [],
    ];
  }

  const severity =
    value === null
      ? resolveNoDataSeverity({
          noData: monitor.noData,
          aggregation: monitor.metric.aggregation,
          prevSeverity: monitor.severity,
          operator: monitor.thresholdOperator,
          alertThreshold: monitor.alertThreshold,
          warningThreshold: monitor.warningThreshold ?? null,
        })
      : computeSeverity({
          value,
          operator: monitor.thresholdOperator,
          alertThreshold: monitor.alertThreshold,
          warningThreshold: monitor.warningThreshold ?? null,
        });

  const { completion, emit } = applyStateMachine({
    prev: monitor,
    next: { severity },
    now,
    publishedAt,
  });
  if (!emit) return [completion, []];

  const automations = getAutomations({ monitor, completion, triggers });
  if (automations.length === 0) return [completion, []];

  const alert = buildAlert({ prev: monitor, next: completion, runAt });
  return [completion, toMonitorWebhookInputs({ alert, automations, now })];
}

/** getMetricValue reads a monitor's scalar result from the metrics map, returning the ErrorBadQuery sentinel before the zero-count NO_DATA gate so a rejected metric flips rather than reads NO_DATA. */
function getMetricValue(
  metrics: MetricMap,
  metric: Monitor["metric"],
): MetricValue {
  const value = metrics[metricKey(metric)];
  if (value === ErrorBadQuery) return ErrorBadQuery;
  if (metrics["count_count"] === 0) return null;
  return value ?? null;
}

/** getAutomations returns the automations under every trigger that consumes this alert. */
function getAutomations(args: {
  monitor: Monitor;
  completion: MonitorCompletion;
  triggers: TriggerDomainWithActions[];
}): TriggerDomainWithActions["automations"] {
  const filterData = {
    severity: args.completion.severity,
    triggerIds: args.monitor.triggerIds,
  };
  return args.triggers
    .filter((trigger) => matchesTriggerFilter(filterData, trigger))
    .flatMap((trigger) => trigger.automations);
}

/** buildAlert assembles the MonitorAlert payload from the monitor row and state-machine completion. */
function buildAlert(args: {
  prev: Monitor;
  next: MonitorCompletion;
  runAt: Date;
}): MonitorAlert {
  const { prev, next, runAt } = args;
  const { fromTimestamp, toTimestamp } = evaluationWindow(prev.window, runAt);
  return {
    monitorId: prev.id,
    projectId: prev.projectId,
    severity: next.severity,
    timestamp: runAt,
    fromTimestamp,
    toTimestamp,
    permalink: buildPermalink(prev.projectId, prev.id),
    message: renderAlertMessage({ monitor: prev, completion: next }),
    view: prev.view,
    filters: prev.filters,
    window: prev.window,
  };
}

/** buildPermalink composes the absolute Langfuse URL for a monitor, or undefined when NEXTAUTH_URL is unset. */
export function buildPermalink(
  projectId: string,
  monitorId: string,
): string | undefined {
  if (!env.NEXTAUTH_URL) return undefined;
  const base = env.NEXTAUTH_URL.replace(/\/$/, "");
  return `${base}/project/${projectId}/monitors/${monitorId}`;
}

/** toMonitorWebhookInputs fans an alert out to one webhook input per matched automation. */
function toMonitorWebhookInputs(args: {
  alert: MonitorAlert;
  automations: TriggerDomainWithActions["automations"];
  now: Date;
}): MonitorWebhookInput[] {
  return args.automations.map((automation) => {
    const executionId = randomUUID();
    return {
      projectId: args.alert.projectId,
      automationId: automation.id,
      executionId,
      payload: {
        id: executionId,
        timestamp: args.now,
        type: "monitor-alert",
        apiVersion: "v1",
        payload: args.alert,
      },
    };
  });
}

/** buildCompleteQuery builds the bulk UPDATE that lands every monitor's post-evaluation stamps. */
function buildCompleteQuery(args: {
  projectId: string;
  completions: MonitorCompletion[];
}): Prisma.Sql {
  const valueRows = Prisma.join(
    args.completions.map(
      (c) =>
        Prisma.sql`(${c.monitorId}, ${c.lastClaimedAt}::timestamptz, ${c.lastCompletedAt}::timestamptz, ${c.publishedAt}::timestamptz, ${c.status}::"MonitorStatus", ${c.severity}::"MonitorSeverity", ${c.severityChangedAt}::timestamptz, ${c.alertedAt}::timestamptz)`,
    ),
    ", ",
  );
  return Prisma.sql`
    UPDATE monitors AS m
    SET
      last_completed_at = data.last_completed_at,
      status = data.status,
      severity = data.severity,
      severity_changed_at = data.severity_changed_at,
      alerted_at = data.alerted_at
    FROM (VALUES ${valueRows}) AS data(
      id,
      last_claimed_at,
      last_completed_at,
      published_at,
      status,
      severity,
      severity_changed_at,
      alerted_at
    )
    WHERE m.id = data.id
      AND m.project_id = ${args.projectId}
      AND m.last_claimed_at = data.last_claimed_at -- no-op if another worker re-claimed since
      AND m.status = 'ACTIVE' -- no-op if the user paused since claim
      AND m.last_published_at = data.published_at -- no-op if the scheduler rescued/republished since claim
  `;
}

/** MetricValue is one metric's evaluated result: a number, null (missing/non-finite), or the ErrorBadQuery sentinel. */
export type MetricValue = number | null | typeof ErrorBadQuery;

/** MetricMap keys each metric's MetricValue by `${aggregation}_${measure}`. */
type MetricMap = Record<string, MetricValue>;

/** MonitorPublisher publishes one MonitorWebhookInput onto the webhook queue. */
export type MonitorPublisher = (input: MonitorWebhookInput) => Promise<void>;

/** QueryExecutor runs a monitor's ClickHouse query. */
export type QueryExecutor = typeof defaultExecuteQuery;

/** GetTriggerConfigurations loads the trigger configurations matching a filter. */
export type GetTriggerConfigurations = typeof defaultGetTriggerConfigurations;
