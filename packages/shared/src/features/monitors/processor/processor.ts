import { randomUUID } from "crypto";

import { JobConfigState, Prisma, type PrismaClient } from "../../../db";
import { env } from "../../../env";
import { TriggerEventSource } from "../../../domain/automations";
import { matchesTriggerFilter } from "../../../server/automations";
import {
  instrumentAsync,
  instrumentSync,
} from "../../../server/instrumentation";
import {
  getTriggerConfigurations as defaultGetTriggerConfigurations,
  type TriggerDomainWithActions,
} from "../../../server/repositories/automation-repository";
import { executeQuery as defaultExecuteQuery } from "../../query/server/queryExecutor";
import type { QueryType } from "../../query/types";
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
import { renderAlertMessage } from "./renderAlertMessage";

/** monitorEvaluationOffsetMs shifts the query window back so ClickHouse reads data settled past the events-table write lag. */
export const monitorEvaluationOffsetMs = 30 * 1000;

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
        lastPublishedAt: { lte: event.publishedAt }, // newest event
        AND: [
          // not already claimed
          {
            OR: [
              { lastClaimedAt: null },
              { lastClaimedAt: { lte: event.publishedAt } },
            ],
          },
          // not yet completed
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

  /** queryMetrics runs the monitor's scalar query and returns each metric coerced to number | null. */
  private async queryMetrics(
    event: MonitorQueueEvent,
  ): Promise<Record<string, number | null>> {
    const rows = await this.executeQuery(
      event.projectId,
      buildMonitorQuery(event),
      "v2",
      true,
    );
    const row = (rows[0] ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(row).map(([name, value]) => [
        name,
        parseNumericValue(value),
      ]),
    );
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

/** buildMonitorQuery converts a MonitorQueueEvent into the scalar QueryType executeQuery accepts. */
function buildMonitorQuery(event: MonitorQueueEvent): QueryType {
  const { fromTimestamp, toTimestamp } = evaluationWindow(
    event.window,
    event.runAt,
  );
  return {
    view: event.view,
    dimensions: [],
    metrics: event.metrics,
    filters: event.filters,
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };
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
  metrics: Record<string, number | null>;
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

/** processMonitor evaluates one monitor and returns its lifecycle completion plus any webhook inputs to publish. */
function processMonitor(args: {
  monitor: Monitor;
  metrics: Record<string, number | null>;
  triggers: TriggerDomainWithActions[];
  now: Date;
  runAt: Date;
  publishedAt: Date;
}): [MonitorCompletion, MonitorWebhookInput[]] {
  const { monitor, metrics, triggers, now, runAt, publishedAt } = args;
  const severity = computeSeverity({
    value: getValue(metrics, monitor.metric),
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

/** getValue reads a monitor's scalar result from the metrics map, keyed by `${aggregation}_${measure}`. */
function getValue(
  metrics: Record<string, number | null>,
  metric: Monitor["metric"],
): number | null {
  return metrics[`${metric.aggregation}_${metric.measure}`] ?? null;
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
        Prisma.sql`(${c.monitorId}, ${c.lastClaimedAt}::timestamptz, ${c.lastCompletedAt}::timestamptz, ${c.publishedAt}::timestamptz, ${c.severity}::"MonitorSeverity", ${c.severityChangedAt}::timestamptz, ${c.alertedAt}::timestamptz)`,
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
      last_claimed_at,
      last_completed_at,
      published_at,
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

/** MonitorPublisher publishes one MonitorWebhookInput onto the webhook queue. */
export type MonitorPublisher = (input: MonitorWebhookInput) => Promise<void>;

/** QueryExecutor runs a monitor's ClickHouse query. */
export type QueryExecutor = typeof defaultExecuteQuery;

/** GetTriggerConfigurations loads the trigger configurations matching a filter. */
export type GetTriggerConfigurations = typeof defaultGetTriggerConfigurations;
