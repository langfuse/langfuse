import { buildColoredAttachmentSlackMessage } from "../../../server/services/buildColoredAttachmentSlackMessage";
import { type SlackMessage } from "../../../server/services/SlackService";
import { type MonitorAlert, type MonitorSeverity } from "../types";

/** severityVisual maps MonitorSeverity to its Slack attachment color. */
const severityVisual: Record<MonitorSeverity, { color: string }> = {
  ALERT: { color: "#dc3545" },
  WARNING: { color: "#ffc107" },
  OK: { color: "#28a745" },
  NO_DATA: { color: "#6c757d" },
  UNKNOWN: { color: "#6c757d" },
  PAUSED: { color: "#6c757d" },
};

/** buildMonitorAlertSlackMessage renders a MonitorAlert into a Slack Block Kit SlackMessage. */
export function buildMonitorAlertSlackMessage(
  alert: MonitorAlert,
): SlackMessage {
  return buildColoredAttachmentSlackMessage({
    color: severityVisual[alert.severity].color,
    title: alert.message.title,
    body: alert.message.body,
    timestamp: alert.timestamp,
    url: alert.permalink,
    secondaryUrl: alert.dataPermalink,
    secondaryLabel:
      alert.view === "observations" ? "View observations" : "View traces",
  });
}
