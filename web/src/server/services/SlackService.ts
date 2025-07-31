/**
 * Slack Integration Service for Web Package
 *
 * Handles OAuth flow management and integration status for the web frontend.
 * Includes full OAuth functionality using @slack/oauth InstallProvider.
 */

import { WebClient } from "@slack/web-api";
import { InstallProvider } from "@slack/oauth";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt, decrypt } from "@langfuse/shared/encryption";

// Types for Slack integration
export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

export interface SlackMessageParams {
  channelId: string;
  blocks: any[];
  text?: string;
}

export interface SlackMessageResponse {
  messageTs: string;
  channel: string;
}

export interface SlackInstallationMetadata {
  projectId: string;
}

/**
 * Parse and validate Slack installation metadata
 */
export function parseSlackInstallationMetadata(
  metadata: unknown,
): SlackInstallationMetadata {
  if (typeof metadata !== "string") {
    throw new Error("Installation metadata must be a string");
  }

  let parsedMetadata: unknown;
  try {
    parsedMetadata = JSON.parse(metadata);
  } catch (error) {
    throw new Error("Invalid JSON in installation metadata");
  }

  if (
    typeof parsedMetadata !== "object" ||
    parsedMetadata === null ||
    typeof (parsedMetadata as any).projectId !== "string"
  ) {
    throw new Error(
      "Installation metadata must contain a valid projectId string",
    );
  }

  return parsedMetadata as SlackInstallationMetadata;
}

/**
 * Slack Service Class for Web Package
 *
 * Uses InstallProvider for OAuth flow and metadata-based project mapping.
 * Handles integration management, OAuth flow, and validation.
 */
export class SlackService {
  private static instance: SlackService | null = null;
  private installer: InstallProvider;

  private constructor() {
    this.installer = new InstallProvider({
      clientId: env.SLACK_CLIENT_ID!,
      clientSecret: env.SLACK_CLIENT_SECRET!,
      stateSecret: env.SLACK_STATE_SECRET!,
      installUrlOptions: {
        scopes: ["channels:read", "chat:write", "chat:write.public"],
      },
      installationStore: {
        storeInstallation: async (installation) => {
          try {
            const metadata = parseSlackInstallationMetadata(
              installation.metadata,
            );
            const projectId = metadata.projectId;

            logger.info("Storing Slack installation for project", {
              projectId,
              teamId: installation.team?.id,
              teamName: installation.team?.name,
            });

            // Store by projectId (one integration per project)
            await prisma.slackIntegration.upsert({
              where: { projectId },
              create: {
                projectId,
                teamId: installation.team?.id!,
                teamName: installation.team?.name!,
                botToken: encrypt(installation.bot?.token!),
                botUserId: installation.bot?.userId!,
              },
              update: {
                teamId: installation.team?.id!,
                teamName: installation.team?.name!,
                botToken: encrypt(installation.bot?.token!),
                botUserId: installation.bot?.userId!,
              },
            });

            logger.info("Slack installation stored successfully", {
              projectId,
              teamId: installation.team?.id,
            });
          } catch (error) {
            logger.error("Failed to store Slack installation", { error });
            throw error;
          }
        },

        fetchInstallation: async (installQuery) => {
          try {
            // Handle both teamId and projectId lookups
            // When SDK calls with teamId, we treat it as projectId
            const lookupId = installQuery.teamId;

            if (!lookupId) {
              throw new Error("No lookup ID provided");
            }

            const integration = await prisma.slackIntegration.findFirst({
              where: {
                OR: [
                  { teamId: lookupId }, // Actual team ID lookup
                  { projectId: lookupId }, // Project ID lookup (our custom usage)
                ],
              },
            });

            if (!integration) {
              throw new Error("Slack integration not found");
            }

            // Return full Installation interface as expected by SDK
            return {
              team: {
                id: integration.teamId,
                name: integration.teamName,
              },
              bot: {
                id: integration.botUserId,
                token: decrypt(integration.botToken),
                userId: integration.botUserId,
                scopes: [],
              },
              enterprise: undefined,
              user: {
                token: undefined,
                refreshToken: undefined,
                expiresAt: undefined,
                scopes: undefined,
                id: integration.botUserId,
              },
            };
          } catch (error) {
            logger.error("Failed to fetch Slack installation", { error });
            throw error;
          }
        },

        deleteInstallation: async (installQuery) => {
          try {
            const lookupId = installQuery.teamId;

            if (!lookupId) {
              throw new Error("No lookup ID provided for deletion");
            }

            await prisma.slackIntegration.deleteMany({
              where: {
                OR: [{ teamId: lookupId }, { projectId: lookupId }],
              },
            });

            logger.info("Slack installation deleted successfully", {
              lookupId,
            });
          } catch (error) {
            logger.error("Failed to delete Slack installation", { error });
            throw error;
          }
        },
      },
    });
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
   * Get the configured InstallProvider instance for OAuth handling
   */
  getInstaller(): InstallProvider {
    return this.installer;
  }

  /**
   * Delete Slack integration for a project
   */
  async deleteIntegration(projectId: string): Promise<void> {
    try {
      if (!this.installer.installationStore?.deleteInstallation) {
        throw new Error("Installation store not configured");
      }

      await this.installer.installationStore.deleteInstallation({
        teamId: projectId,
        isEnterpriseInstall: false,
        enterpriseId: undefined,
      });

      logger.info("Slack integration deleted for project", { projectId });
    } catch (error) {
      logger.error("Failed to delete Slack integration", { error, projectId });
      throw new Error(
        `Failed to delete integration: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get WebClient for a specific project
   */
  async getWebClientForProject(projectId: string): Promise<WebClient> {
    try {
      // Use projectId as the teamId parameter (handled by our fetchInstallation)
      const auth = await this.installer.authorize({
        teamId: projectId,
        isEnterpriseInstall: false,
        enterpriseId: undefined,
      });

      if (!auth.botToken) {
        throw new Error("No bot token found for project");
      }

      const client = new WebClient(auth.botToken);
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
   * Get channels accessible to the bot
   */
  async getChannels(client: WebClient): Promise<SlackChannel[]> {
    try {
      const result = await client.conversations.list({
        exclude_archived: true,
        types: "public_channel",
        limit: 200,
      });

      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      const channels: SlackChannel[] = (result.channels || []).map(
        (channel) => ({
          id: channel.id!,
          name: channel.name!,
          isPrivate: channel.is_private || false,
          isMember: channel.is_member || false,
        }),
      );

      logger.debug("Retrieved channels from Slack", {
        channelCount: channels.length,
      });

      return channels;
    } catch (error) {
      logger.error("Failed to fetch channels", { error });
      throw new Error(
        `Failed to fetch channels: ${error instanceof Error ? error.message : "Unknown error"}`,
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
