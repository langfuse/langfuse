import {
  logger,
  escapeSlackMrkdwn,
  type WebhookInput,
  type SlackMessage,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

type WebhookInputPayload = WebhookInput["payload"];
type PromptVersionPayload = Extract<
  WebhookInputPayload,
  { type: "prompt-version" }
>;

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
