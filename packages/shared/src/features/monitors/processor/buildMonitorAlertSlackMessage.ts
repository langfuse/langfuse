import { slackifyMarkdown } from "slackify-markdown";

import {
  escapeSlackMrkdwn,
  type SlackMessage,
} from "../../../server/services/SlackService";
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
  const { color } = severityVisual[alert.severity];
  const title = escapeSlackMrkdwn(alert.message.title);
  const titleText = alert.permalink
    ? `*<${alert.permalink}|${title}>*`
    : `*${title}*`;
  const blocks: any[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: titleText },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: slackifyMarkdown(alert.message.body) },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `⏱ ${alert.timestamp.toISOString()}`,
        },
      ],
    },
    ...(alert.permalink
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "View in Langfuse",
                  emoji: true,
                },
                url: alert.permalink,
              },
            ],
          },
        ]
      : []),
  ];
  // Color bar renders only on attachment-nested blocks; top-level text/blocks would duplicate above it.
  return {
    blocks: [],
    attachments: [{ color, fallback: alert.message.title, blocks }],
  };
}
