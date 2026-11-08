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
    case "skill-version":
      return buildVersionChangeEvent(args.envelope, context);
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
      dedup_key: toDedupeKey(context, alert.monitorId),
    },
  };
}

/** toDedupeKey keys a monitor's PagerDuty alert across its triggers and resolve. */
function toDedupeKey(context: EventContext, monitorId: string): string {
  return `langfuse-${context.projectId}-${monitorId}`;
}

/** buildMonitorTriggerEvent triggers the monitor's alert at the given severity. */
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
      dedup_key: toDedupeKey(context, alert.monitorId),
      ...clientFields(context.projectId, alert.permalink),
      links: toLinks(alert),
      payload: toPayload(alert, severity, context.projectName),
    },
  };
}

/** toLinks links the alert and its breaching data window. */
function toLinks(alert: MonitorAlert): PagerDutyLink[] {
  return compactLinks([
    { href: alert.permalink, text: "View in Langfuse" },
    { href: alert.dataPermalink, text: dataLinkText(alert.view) },
  ]);
}

/** dataLinkText labels the data link by the table it opens. */
function dataLinkText(view: MonitorAlert["view"]): string {
  if (view === "observations") return "View observations";
  return "View scores";
}

/** toPayload maps the alert to its PagerDuty payload, with the alert as custom details. */
function toPayload(
  alert: MonitorAlert,
  severity: PagerDutySeverity,
  projectName: string,
): NonNullable<PagerDutyAlertEvent["payload"]> {
  return {
    summary: truncatePagerDutySummary(alert.message.title),
    source: source(projectName),
    severity,
    timestamp: alert.timestamp.toISOString(),
    class: "monitor-alert",
    component: alert.view,
    custom_details: { ...alert },
  };
}

/** clientFields names Langfuse as the sender and links `href`, or else the project. */
function clientFields(
  projectId: string,
  href?: string,
): Pick<PagerDutyAlertEvent, "client" | "client_url"> {
  return {
    client,
    client_url:
      href ??
      safeUrl(() =>
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

/** buildVersionChangeEvent records a prompt or skill version change without paging anyone. */
function buildVersionChangeEvent(
  envelope: Extract<
    PagerDutyEnvelope,
    { type: "prompt-version" | "skill-version" }
  >,
  context: EventContext,
): PagerDutyEvent {
  const entity = envelope.type === "prompt-version" ? "prompt" : "skill";
  const version =
    envelope.type === "prompt-version" ? envelope.prompt : envelope.skill;
  return {
    kind: "change",
    event: {
      routing_key: context.routingKey,
      links: compactLinks([
        {
          href: safeUrl(() =>
            envelope.type === "prompt-version"
              ? buildPromptUrl({
                  projectId: context.projectId,
                  name: version.name,
                  version: version.version,
                })
              : new URL(
                  `project/${encodeURIComponent(context.projectId)}/skills/${encodeURIComponent(version.name)}?version=${version.version}`,
                  getProductBaseUrl(),
                ).toString(),
          ),
          text: `View ${entity} in Langfuse`,
        },
      ]),
      payload: {
        summary: truncatePagerDutySummary(
          `Langfuse ${entity} "${version.name}" version ${version.version} ${envelope.action}`,
        ),
        source: source(context.projectName),
        timestamp: new Date().toISOString(),
        custom_details: {
          [`${entity}_name`]: version.name,
          [`${entity}_version`]: version.version,
          action: envelope.action,
          labels: version.labels,
          tags: version.tags,
          commit_message: version.commitMessage,
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
      prompt: VersionChange;
    }
  | {
      type: "skill-version";
      action: string;
      skill: VersionChange;
    };

/** VersionChange is the prompt or skill metadata included in a PagerDuty change event. */
type VersionChange = {
  name: string;
  version: number;
  labels: string[];
  tags: string[];
  commitMessage: string | null;
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
