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
    if (payload.type !== "prompt-version") {
      return this.buildFallbackMessage(payload);
    }

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
   * Build Block Kit message for trace events.
   * Includes observation-level context when the event was triggered by an error observation.
   */
  static buildTraceMessage(payload: WebhookInput["payload"]): any[] {
    if (payload.type !== "trace") {
      return this.buildFallbackMessage(payload);
    }

    const { action, trace, observationLevel, observationId } = payload;
    const traceName = trace.name ?? "Unnamed Trace";

    // Use error-specific header when triggered by an observation with ERROR level
    const isErrorTriggered = observationLevel === "ERROR";
    const headerEmoji = isErrorTriggered
      ? "🚨"
      : this.getActionConfig(action).emoji;
    const headerText = isErrorTriggered
      ? `${headerEmoji} Error in Trace`
      : `${headerEmoji} Trace ${action}`;
    const descriptionText = isErrorTriggered
      ? `An observation with *ERROR* level was detected in trace *${traceName}*`
      : `*${traceName}* has been *${action}*`;

    const blocks = [
      // Header block
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true,
        },
      },
      // Main content section
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: descriptionText,
        },
      },
      // Details section with key information
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Environment:*\n${trace.environment}`,
          },
          {
            type: "mrkdwn",
            text: `*Tags:*\n${trace.tags.length > 0 ? trace.tags.join(", ") : "None"}`,
          },
          ...(observationLevel
            ? [
                {
                  type: "mrkdwn",
                  text: `*Observation Level:*\n${observationLevel}`,
                },
              ]
            : []),
          ...(observationId
            ? [
                {
                  type: "mrkdwn",
                  text: `*Observation ID:*\n\`${observationId}\``,
                },
              ]
            : []),
          ...(trace.userId
            ? [
                {
                  type: "mrkdwn",
                  text: `*User:*\n${trace.userId}`,
                },
              ]
            : []),
          ...(trace.sessionId
            ? [
                {
                  type: "mrkdwn",
                  text: `*Session:*\n${trace.sessionId}`,
                },
              ]
            : []),
        ],
      },
      // Release/Version info if available
      ...(trace.release || trace.version
        ? [
            {
              type: "section",
              fields: [
                ...(trace.release
                  ? [
                      {
                        type: "mrkdwn",
                        text: `*Release:*\n${trace.release}`,
                      },
                    ]
                  : []),
                ...(trace.version
                  ? [
                      {
                        type: "mrkdwn",
                        text: `*Version:*\n${trace.version}`,
                      },
                    ]
                  : []),
              ],
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
                    text: "View Trace",
                    emoji: true,
                  },
                  url: `${env.NEXTAUTH_URL}/project/${trace.projectId}/traces/${trace.id}`,
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
        case "trace":
          return this.buildTraceMessage(payload);
        default:
          logger.warn(
            `Unsupported Slack message type: ${(payload as any).type}`,
          );
          return this.buildFallbackMessage(payload);
      }
    } catch (error) {
      logger.error("Error building Slack message", { error, payload });
      return this.buildFallbackMessage(payload);
    }
  }
}
