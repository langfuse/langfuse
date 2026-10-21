import { buildColoredAttachmentSlackMessage } from "../../../server/services/buildColoredAttachmentSlackMessage";
import { buildSlackLinkSection } from "../../../server/services/buildSlackLinkSection";
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
  const secondaryLabel =
    alert.view === "observations" ? "View observations" : "View scores";
  const dataLinkFits =
    !!alert.permalink &&
    !!alert.dataPermalink &&
    buildSlackLinkSection([
      { label: "View in Langfuse", url: alert.permalink },
      { label: secondaryLabel, url: alert.dataPermalink },
    ]).text.text.includes(alert.dataPermalink);
  const missingScoreLink =
    alert.view !== "observations" &&
    alert.permalink &&
    !dataLinkFits &&
    (alert.severity === "ALERT" || alert.severity === "WARNING");
  return buildColoredAttachmentSlackMessage({
    color: severityVisual[alert.severity].color,
    title: alert.message.title,
    body: missingScoreLink
      ? `${alert.message.body}\n\nA filtered scores link is unavailable for this alert. Open the alert to review its filters.`
      : alert.message.body,
    timestamp: alert.timestamp,
    url: alert.permalink,
    secondaryUrl: alert.dataPermalink,
    secondaryLabel,
  });
}
