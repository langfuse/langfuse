import { logger } from "@langfuse/shared/src/server";
import type { WebhookInput } from "@langfuse/shared/src/server";
import type { MonitorSeverity } from "@langfuse/shared";
import type { MonitorWebhookQueueEvent } from "@langfuse/shared/monitors/server";
import { slackifyMarkdown } from "slackify-markdown";
import { env } from "../../env";

/** severityVisual maps MonitorSeverity to its Slack emoji + attachment color per RFC §895-900. */
const severityVisual: Record<
  MonitorSeverity,
  { emoji: string; color: string }
> = {
  ALERT: { emoji: "🚨", color: "#dc3545" },
  WARNING: { emoji: "⚠️", color: "#ffc107" },
  OK: { emoji: "✅", color: "#28a745" },
  NO_DATA: { emoji: "❓", color: "#6c757d" },
  UNKNOWN: { emoji: "❓", color: "#6c757d" },
  PAUSED: { emoji: "⏸️", color: "#6c757d" },
};

/** Escape Slack mrkdwn special characters to prevent injection (e.g. <!channel>)
 * @see https://docs.slack.dev/messaging/formatting-message-text/#escaping */
export function escapeSlackMrkdwn(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type WebhookInputPayload = WebhookInput["payload"];
type PromptVersionPayload = Extract<
  WebhookInputPayload,
  { type: "prompt-version" }
>;

/** SlackMessage is the shape returned by buildMessage: blocks for Block Kit, optional attachments for the legacy color bar (used by monitor-alert). */
export interface SlackMessage {
  blocks: any[];
  attachments?: { color: string }[];
}

/**
 * Builds Slack Block Kit messages for different Langfuse event types
 */
export class SlackMessageBuilder {
  /**
   * Build Block Kit message for prompt version events
   */
  static buildPromptVersionMessage(payload: PromptVersionPayload): any[] {
    const { action, prompt } = payload;

    // Determine action emoji and color
    const actionConfig = this.getActionConfig(action);

    // Build the main message blocks
    const blocks = [
      // Header block with emoji and action
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${actionConfig.emoji} Prompt ${action}`,
          emoji: true,
        },
      },
      // Main content section
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escapeSlackMrkdwn(prompt.name)}* (version ${prompt.version}) has been *${action}*`,
        },
      },
      // Details section with key information
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Change author:*\n${escapeSlackMrkdwn(payload.user?.name || payload.user?.email || "API User")}`,
          },
          {
            type: "mrkdwn",
            text: `*Type:*\n${prompt.type}`,
          },
          {
            type: "mrkdwn",
            text: `*Version:*\n${prompt.version}`,
          },
          {
            type: "mrkdwn",
            text: `*Labels:*\n${prompt.labels.length > 0 ? prompt.labels.join(", ") : "None"}`,
          },
          {
            type: "mrkdwn",
            text: `*Tags:*\n${prompt.tags.length > 0 ? prompt.tags.map(escapeSlackMrkdwn).join(", ") : "None"}`,
          },
        ],
      },
      // Commit message if available
      ...(prompt.commitMessage
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Commit Message:*\n> ${escapeSlackMrkdwn(prompt.commitMessage)}`,
              },
            },
          ]
        : []),
      // Action buttons
      ...(env.NEXTAUTH_URL
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "View Prompt",
                    emoji: true,
                  },
                  url: `${env.NEXTAUTH_URL}/project/${prompt.projectId}/prompts/${encodeURIComponent(prompt.name)}?version=${prompt.version}`,
                  style: "primary",
                },
              ],
            },
          ]
        : []),
    ];

    return blocks;
  }

  /**
   * Build a simple fallback message for unsupported event types
   */
  static buildFallbackMessage(payload: WebhookInputPayload): any[] {
    // Fallback handles malformed and not-yet-known payloads — narrow off the
    // discriminated union and read `.action` opportunistically.
    const action =
      (payload as { action?: string }).action ?? payload.type ?? "event";
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Langfuse Notification*\n${payload.type} event: *${action}*`,
        },
      },
    ];
  }

  /** buildMonitorMessage renders a MonitorWebhookQueueEvent into Slack Block Kit per RFC §855-902. The processor emits standard markdown; we convert the body to Slack mrkdwn via slackify-markdown. */
  static buildMonitorMessage(envelope: MonitorWebhookQueueEvent): SlackMessage {
    const alert = envelope.payload;
    const { color } = severityVisual[alert.severity];
    // Slack hard-limits header plain_text to 150 chars and rejects longer
    // values with invalid_blocks; the [SEVERITY] prefix already conveys
    // severity, so the header carries the title alone (no severity emoji).
    const title = alert.message.title;
    const headerText = title.length > 150 ? `${title.slice(0, 149)}…` : title;
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: slackifyMarkdown(alert.message.body) },
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
                  style: "primary",
                },
              ],
            },
          ]
        : []),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `⏱ ${alert.timestamp.toISOString()}`,
          },
        ],
      },
    ];
    return { blocks, attachments: [{ color }] };
  }

  /**
   * Get action-specific configuration (emoji, color, etc.)
   */
  private static getActionConfig(action: string): {
    emoji: string;
    color?: string;
  } {
    switch (action.toLowerCase()) {
      case "created":
        return { emoji: "✨", color: "good" };
      case "updated":
        return { emoji: "📝", color: "warning" };
      case "deleted":
        return { emoji: "🗑️", color: "danger" };
      default:
        return { emoji: "📋" };
    }
  }

  /**
   * Main entry point - builds appropriate message for event type
   */
  static buildMessage(payload: WebhookInputPayload): SlackMessage {
    try {
      switch (payload.type) {
        case "prompt-version":
          return { blocks: this.buildPromptVersionMessage(payload) };
        case "monitor-alert":
          return this.buildMonitorMessage(payload);
        default: {
          const unknownType = (payload as { type: string }).type;
          logger.warn(`Unsupported Slack message type: ${unknownType}`);
          return { blocks: this.buildFallbackMessage(payload) };
        }
      }
    } catch (error) {
      logger.error("Error building Slack message", { error, payload });
      return { blocks: this.buildFallbackMessage(payload) };
    }
  }
}
