/**
 * Slack Integration Service for Worker Package
 *
 * Handles message sending functionality for background job processing.
 * Includes only messaging capabilities, no OAuth functionality.
 */

import { WebClient } from "@slack/web-api";
import { logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
// Types for Slack integration
export interface SlackMessageParams {
  channelId: string;
  blocks: any[];
  text?: string;
}

export interface SlackMessageResponse {
  messageTs: string;
  channel: string;
}

/**
 * Slack Service Class for Worker Package
 *
 * Simplified service focused on message sending for automation workflows.
 * Does not include OAuth functionality to minimize bundle size.
 */
export class SlackService {
  private static instance: SlackService | null = null;

  private constructor() {
    // No InstallProvider needed for worker
  }

  /**
   * Get singleton instance of SlackService
   */
  static getInstance(): SlackService {
    if (!SlackService.instance) {
      SlackService.instance = new SlackService();
    }
    return SlackService.instance;
  }

  /**
   * Get WebClient for a specific project
   */
  async getWebClientForProject(projectId: string): Promise<WebClient> {
    try {
      logger.debug("Getting WebClient for project", { projectId });

      const integration = await prisma.slackIntegration.findUnique({
        where: { projectId },
      });

      if (!integration) {
        throw new Error(`No integration found for project ${projectId}`);
      }

      const decryptedToken = decrypt(integration.botToken);
      const client = new WebClient(decryptedToken);

      logger.debug("Created WebClient for project", { projectId });

      return client;
    } catch (error) {
      logger.error("Failed to create WebClient for project", {
        error,
        projectId,
      });
      throw new Error(
        `Failed to create WebClient: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Send a message to a Slack channel
   */
  async sendMessage(
    client: WebClient,
    params: SlackMessageParams,
  ): Promise<SlackMessageResponse> {
    try {
      const result = await client.chat.postMessage({
        channel: params.channelId,
        blocks: params.blocks,
        text: params.text || "Langfuse Notification",
        unfurl_links: false,
        unfurl_media: false,
      });

      if (!result.ok) {
        throw new Error(`Failed to send message: ${result.error}`);
      }

      const response = {
        messageTs: result.ts!,
        channel: result.channel!,
      };

      logger.info("Message sent successfully to Slack", {
        channel: params.channelId,
        messageTs: response.messageTs,
      });

      return response;
    } catch (error) {
      logger.error("Failed to send message", {
        error,
        channelId: params.channelId,
      });
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Validate a WebClient instance
   */
  async validateClient(client: WebClient): Promise<boolean> {
    try {
      const result = await client.auth.test();
      return result.ok || false;
    } catch (error) {
      logger.warn("Client validation failed", { error });
      return false;
    }
  }
}
