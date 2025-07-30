import { logger } from "@langfuse/shared/src/server";
import type { WebhookInput } from "@langfuse/shared/src/server";
import { env } from "../../env";

/**
 * Builds Slack Block Kit messages for different Langfuse event types
 */
export class SlackMessageBuilder {
  /**
   * Build Block Kit message for prompt version events
   */
  static buildPromptVersionMessage(payload: WebhookInput["payload"]): any[] {
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
          text: `*${prompt.name}* (version ${prompt.version}) has been *${action}*`,
        },
      },
      // Details section with key information
      {
        type: "section",
        fields: [
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
            text: `*Tags:*\n${prompt.tags.length > 0 ? prompt.tags.join(", ") : "None"}`,
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
                text: `*Commit Message:*\n> ${prompt.commitMessage}`,
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
      // Footer with timestamp
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🕒 ${new Date().toLocaleString()} | Langfuse`,
          },
        ],
      },
    ];

    return blocks;
  }

  /**
   * Build a simple fallback message for unsupported event types
   */
  static buildFallbackMessage(payload: WebhookInput["payload"]): any[] {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Langfuse Notification*\n${payload.type} event: *${payload.action}*`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🕒 ${new Date().toLocaleString()} | Langfuse`,
          },
        ],
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
  static buildMessage(payload: WebhookInput["payload"]): any[] {
    try {
      switch (payload.type) {
        case "prompt-version":
          return this.buildPromptVersionMessage(payload);
        default:
          logger.warn(`Unsupported Slack message type: ${payload.type}`);
          return this.buildFallbackMessage(payload);
      }
    } catch (error) {
      logger.error("Error building Slack message", { error, payload });
      return this.buildFallbackMessage(payload);
    }
  }
}
