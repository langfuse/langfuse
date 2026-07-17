import { buildColoredAttachmentSlackMessage } from "../services/buildColoredAttachmentSlackMessage";
import { type SlackMessage } from "../services/SlackService";
import {
  type ProjectNotificationEvent,
  type ProjectNotificationEventType,
  type ProjectNotificationSeverity,
} from "./types";

/** projectNotificationTitle maps an event type to a human-readable Slack title. */
const projectNotificationTitle: Record<ProjectNotificationEventType, string> = {
  "blob-export-failed": "Blob storage export failed",
  "evaluator-blocked": "Evaluator blocked",
};

/** severityColor maps a project-notification severity to its Slack attachment color. */
const severityColor: Record<ProjectNotificationSeverity, string> = {
  ALERT: "#dc3545",
  WARNING: "#ffc107",
  INFO: "#6c757d",
};

/**
 * buildProjectNotificationSlackMessage renders a project notification event
 * into a Slack Block Kit message, reusing the monitor-alert layout.
 */
export function buildProjectNotificationSlackMessage(
  event: ProjectNotificationEvent,
): SlackMessage {
  const title = `${projectNotificationTitle[event.eventType]}: ${event.resourceName}`;
  return buildColoredAttachmentSlackMessage({
    color: severityColor[event.severity],
    title,
    body: event.message,
    timestamp: new Date(),
    url: event.url,
    contextText: `Project: ${event.projectName}`,
  });
}
