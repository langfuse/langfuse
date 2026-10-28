import { buildPromptUrl, getProductBaseUrl } from "@langfuse/shared/src/server";
import {
  truncatePagerDutySummary,
  type PagerDutyAlertEvent,
  type PagerDutyChangeEvent,
  type PagerDutyLink,
  type PagerDutySeverity,
} from "@langfuse/shared/pagerduty/server";
import { type MonitorAlert } from "@langfuse/shared/monitors";

const client = "Langfuse";

const monitorSeverities: Partial<
  Record<MonitorAlert["severity"], PagerDutySeverity>
> = {
  ALERT: "critical",
  WARNING: "warning",
  NO_DATA: "error",
};

const notificationSeverities: Record<
  ProjectNotificationEvent["severity"],
  PagerDutySeverity
> = {
  ALERT: "error",
  WARNING: "warning",
  INFO: "info",
};

const modelFilterColumns = new Set([
  "providedModelName",
  "observationModelName",
]);

/** buildPagerDutyEvent maps a validated webhook envelope to its PagerDuty event, or undefined when the alert has nothing to send. */
export function buildPagerDutyEvent(args: {
  envelope: PagerDutyEnvelope;
  projectId: string;
  projectName: string;
  routingKey: string;
}): PagerDutyEvent | undefined {
  const context = {
    projectId: args.projectId,
    projectName: args.projectName,
    routingKey: args.routingKey,
  };
  switch (args.envelope.type) {
    case "monitor-alert":
      return buildMonitorAlertEvent(args.envelope.payload, context);
    case "project-notification":
      return buildProjectNotificationEvent(args.envelope.event, context);
    case "prompt-version":
      return buildPromptChangeEvent(args.envelope, context);
  }
}

/** buildMonitorAlertEvent triggers the monitor's alert at the alert's severity, or resolves it on OK. */
function buildMonitorAlertEvent(
  alert: MonitorAlert,
  context: EventContext,
): PagerDutyEvent | undefined {
  if (alert.severity === "OK") return buildMonitorResolveEvent(alert, context);

  const severity = monitorSeverities[alert.severity];
  if (!severity) return undefined;
  return buildMonitorTriggerEvent(alert, severity, context);
}

/** buildMonitorResolveEvent resolves the monitor's open alert. */
function buildMonitorResolveEvent(
  alert: MonitorAlert,
  context: EventContext,
): PagerDutyEvent {
  return {
    kind: "alert",
    event: {
      routing_key: context.routingKey,
      event_action: "resolve",
      dedup_key: monitorDedupKey(context, alert.monitorId),
    },
  };
}

/** monitorDedupKey keys a monitor's alert so later triggers update its severity and OK resolves it. */
function monitorDedupKey(context: EventContext, monitorId: string): string {
  return `langfuse-${context.projectId}-${monitorId}`;
}

/** buildMonitorTriggerEvent triggers the monitor's alert for the alert's severity. */
function buildMonitorTriggerEvent(
  alert: MonitorAlert,
  severity: PagerDutySeverity,
  context: EventContext,
): PagerDutyEvent {
  return {
    kind: "alert",
    event: {
      routing_key: context.routingKey,
      event_action: "trigger",
      dedup_key: monitorDedupKey(context, alert.monitorId),
      ...clientFields(context.projectId),
      links: compactLinks([
        { href: alert.permalink, text: "View monitor in Langfuse" },
        { href: alert.dataPermalink, text: "View data in the alert window" },
      ]),
      payload: {
        summary: truncatePagerDutySummary(alert.message.title),
        source: source(context.projectName),
        severity,
        timestamp: alert.timestamp.toISOString(),
        class: "monitor-alert",
        component: alert.view,
        custom_details: {
          llmops: buildLlmOpsDetails(alert, context.projectName),
          langfuse: {
            severity: alert.severity,
            message: alert.message.body,
            filters: alert.filters,
            window: alert.window,
          },
        },
      },
    },
  };
}

/** clientFields names Langfuse as the sending client and links the project. */
function clientFields(
  projectId: string,
): Pick<PagerDutyAlertEvent, "client" | "client_url"> {
  return {
    client,
    client_url: safeUrl(() =>
      new URL(`project/${projectId}`, getProductBaseUrl()).toString(),
    ),
  };
}

/** safeUrl returns undefined when the Langfuse base URL is not configured. */
function safeUrl(build: () => string): string | undefined {
  try {
    return build();
  } catch {
    return undefined;
  }
}

/** compactLinks drops links whose URL is unknown. */
function compactLinks(
  links: { href: string | undefined; text: string }[],
): PagerDutyLink[] {
  return links.flatMap((link) => {
    if (!link.href) return [];
    return [{ href: link.href, text: link.text }];
  });
}

/** source identifies the Langfuse project as the affected system. */
function source(projectName: string): string {
  return `langfuse/${projectName}`;
}

/** buildLlmOpsDetails fills PagerDuty's LLMOps fields from the alert. */
function buildLlmOpsDetails(
  alert: MonitorAlert,
  projectName: string,
): Record<string, unknown> {
  const metricDescription = describeMetric(alert.metric);
  return {
    model_name: filteredModelName(alert.filters),
    project_name: projectName,
    monitor_name: alert.monitorName,
    monitor_id: alert.monitorId,
    monitor_alert_start: alert.fromTimestamp.toISOString(),
    monitor_alert_end: alert.toTimestamp.toISOString(),
    metric_description: metricDescription,
    metric_definition: metricDefinition(metricDescription, alert),
    metric_value: alert.metricValue ?? undefined,
    threshold_value: breachedThreshold(alert),
  };
}

/** describeMetric renders a metric as `aggregation(measure)`. */
function describeMetric(metric: MonitorAlert["metric"]): string | undefined {
  if (!metric) return undefined;
  return `${metric.aggregation}(${metric.measure})`;
}

/** filteredModelName returns the model a monitor filters on, when it filters on exactly one. */
function filteredModelName(
  filters: MonitorAlert["filters"],
): string | undefined {
  for (const filter of filters) {
    if (!modelFilterColumns.has(filter.column)) continue;
    if (filter.type === "string" && filter.operator === "=")
      return filter.value;
    if (
      filter.type === "stringOptions" &&
      filter.operator === "any of" &&
      filter.value.length === 1
    ) {
      return filter.value[0];
    }
  }
  return undefined;
}

/** metricDefinition states the metric, its view and the threshold rule. */
function metricDefinition(
  metricDescription: string | undefined,
  alert: MonitorAlert,
): string | undefined {
  if (!metricDescription) return undefined;
  const definition = `${metricDescription} over ${alert.view} per ${alert.window}`;
  if (!alert.thresholdOperator) return definition;
  return `${definition} ${alert.thresholdOperator} ${alert.alertThreshold}`;
}

/** breachedThreshold is the warning threshold for a warning and the alert threshold otherwise. */
function breachedThreshold(alert: MonitorAlert): number | undefined {
  if (alert.severity === "WARNING") return alert.warningThreshold ?? undefined;
  return alert.alertThreshold;
}

/** buildProjectNotificationEvent always triggers, keyed by event type and resource; these are never resolved automatically. */
function buildProjectNotificationEvent(
  event: ProjectNotificationEvent,
  context: EventContext,
): PagerDutyEvent {
  return {
    kind: "alert",
    event: {
      routing_key: context.routingKey,
      event_action: "trigger",
      dedup_key: `langfuse-${context.projectId}-${event.eventType}-${event.resourceId}`,
      ...clientFields(context.projectId),
      links: compactLinks([{ href: event.url, text: "Open in Langfuse" }]),
      payload: {
        summary: truncatePagerDutySummary(
          `${event.message} (${event.resourceName})`,
        ),
        source: source(context.projectName),
        severity: notificationSeverities[event.severity],
        timestamp: new Date().toISOString(),
        class: event.eventType,
        component: event.resourceName,
        custom_details: { langfuse: event },
      },
    },
  };
}

/** buildPromptChangeEvent records a prompt version change as a PagerDuty change event, which never pages anyone. */
function buildPromptChangeEvent(
  envelope: Extract<PagerDutyEnvelope, { type: "prompt-version" }>,
  context: EventContext,
): PagerDutyEvent {
  const { prompt } = envelope;
  return {
    kind: "change",
    event: {
      routing_key: context.routingKey,
      links: compactLinks([
        {
          href: safeUrl(() =>
            buildPromptUrl({
              projectId: context.projectId,
              name: prompt.name,
              version: prompt.version,
            }),
          ),
          text: "View prompt in Langfuse",
        },
      ]),
      payload: {
        summary: truncatePagerDutySummary(
          `Langfuse prompt "${prompt.name}" version ${prompt.version} ${envelope.action}`,
        ),
        source: source(context.projectName),
        timestamp: new Date().toISOString(),
        custom_details: {
          prompt_name: prompt.name,
          prompt_version: prompt.version,
          action: envelope.action,
          labels: prompt.labels,
          tags: prompt.tags,
          commit_message: prompt.commitMessage,
        },
      },
    },
  };
}

/** PagerDutyEvent is an alert event for `/v2/enqueue` or a change event for `/v2/change/enqueue`. */
export type PagerDutyEvent =
  | { kind: "alert"; event: PagerDutyAlertEvent }
  | { kind: "change"; event: PagerDutyChangeEvent };

/** PagerDutyEnvelope is the validated webhook envelope the worker delivers. */
type PagerDutyEnvelope =
  | {
      type: "monitor-alert";
      payload: MonitorAlert;
    }
  | {
      type: "project-notification";
      event: ProjectNotificationEvent;
    }
  | {
      type: "prompt-version";
      action: string;
      prompt: {
        name: string;
        version: number;
        labels: string[];
        tags: string[];
        commitMessage: string | null;
      };
    };

/** ProjectNotificationEvent is the subset of a project notification PagerDuty needs. */
type ProjectNotificationEvent = {
  eventType: string;
  severity: "ALERT" | "WARNING" | "INFO";
  resourceId: string;
  resourceName: string;
  message: string;
  url?: string;
};

/** EventContext carries what every event needs besides its payload. */
type EventContext = {
  projectId: string;
  projectName: string;
  routingKey: string;
};
