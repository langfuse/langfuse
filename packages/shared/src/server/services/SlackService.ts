/**
 * Slack Integration Service
 *
 * Simplified service that properly uses the official Slack SDK libraries:
 * - @slack/oauth InstallProvider for OAuth flow management
 * - @slack/web-api WebClient for Slack API operations
 * - Metadata-based project-to-team mapping
 */

import { WebClient } from "@slack/web-api";
import { InstallProvider } from "@slack/oauth";
import { logger } from "../logger";
import { env } from "../../env";
import { prisma } from "../../db";
import { encrypt, decrypt } from "../../encryption";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Types for Slack integration
export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

export interface SlackMessageParams {
  client: WebClient;
  channelId: string;
  blocks: any[];
  text?: string;
}

export interface SlackMessageResponse {
  messageTs: string;
  channel: string;
}

// Interface for Slack installation metadata
export interface SlackInstallationMetadata {
  projectId: string;
}

/**
 * Type guard to validate Slack installation metadata
 */
function isSlackInstallationMetadata(
  metadata: unknown,
): metadata is SlackInstallationMetadata {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "projectId" in metadata &&
    typeof metadata.projectId === "string" &&
    metadata.projectId.length > 0
  );
}

/**
 * Helper function to safely parse and validate Slack installation metadata
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
  } catch {
    throw new Error("Failed to parse installation metadata as JSON");
  }

  if (!isSlackInstallationMetadata(parsedMetadata)) {
    throw new Error(
      "Invalid installation metadata: missing or invalid projectId",
    );
  }

  return parsedMetadata;
}

/**
 * Slack Service Class
 *
 * Uses InstallProvider for OAuth flow and metadata-based project mapping.
 * Much simpler than the previous implementation while maintaining all functionality.
 */
export class SlackService {
  private static instance: SlackService | null = null;
  private readonly installer: InstallProvider;

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
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    SlackService.instance = null;
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

  private parseRetryAfterMs(error: unknown): number | null {
    if (!error || typeof error !== "object") return null;
    const e = error as {
      headers?: Record<string, string | string[] | undefined>;
    };
    const h = e.headers;
    if (!h) return null;
    const raw = h["retry-after"] ?? h["Retry-After"];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === undefined || v === null) return null;
    const seconds = parseFloat(String(v));
    if (Number.isNaN(seconds)) return null;
    return Math.max(0, Math.floor(seconds * 1000));
  }

  private isSlackRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as Record<string, unknown>;
    if (e.statusCode === 429) return true;
    if (e.code === "slack_webapi_platform_error") {
      const data = e.data as { error?: string } | undefined;
      if (data?.error === "rate_limited") return true;
    }
    const msg = String(e.message ?? "");
    if (msg.includes("rate_limited")) return true;
    if (msg.includes("statusCode = 429")) return true;
    return false;
  }

  private getSlackRetryDelayMs(
    error: unknown | undefined,
    attempt: number,
  ): number {
    const fromHeader = error ? this.parseRetryAfterMs(error) : null;
    if (fromHeader !== null) return fromHeader;
    const base = Math.min(60_000, 1_000 * 2 ** attempt);
    const jitter = Math.floor(Math.random() * 500);
    return base + jitter;
  }

  /**
   * Slack conversations.list with HTTP 429 / rate_limited handling (Retry-After + exponential backoff).
   */
  private async conversationsListWithRetry(
    client: WebClient,
    args: Parameters<WebClient["conversations"]["list"]>[0],
    maxAttempts = 12,
  ): Promise<Awaited<ReturnType<WebClient["conversations"]["list"]>>> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      try {
        const result = await client.conversations.list(args);
        if (result.ok) {
          return result;
        }
        if (result.error === "rate_limited") {
          const delayMs = this.getSlackRetryDelayMs(undefined, attempt);
          logger.warn(
            "Slack conversations.list returned rate_limited, retrying",
            {
              attempt: attempt + 1,
              delayMs,
              maxAttempts,
            },
          );
          await sleep(delayMs);
          attempt++;
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        if (!this.isSlackRateLimitError(error)) {
          throw error;
        }
        const delayMs = this.getSlackRetryDelayMs(error, attempt);
        logger.warn("Slack conversations.list hit rate limit, retrying", {
          attempt: attempt + 1,
          delayMs,
          maxAttempts,
        });
        await sleep(delayMs);
        attempt++;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Slack conversations.list failed after rate-limit retries");
  }

  /**
   * Recursively fetch all channels accessible to the bot
   * Uses cursor-based pagination defined by Slack API https://api.slack.com/apis/pagination
   */
  private async getChannelsRecursive(
    client: WebClient,
    cursor?: string,
    fetchedRecords: number = 0,
  ): Promise<SlackChannel[]> {
    try {
      const pageLimit = Math.min(
        Math.max(1, Math.floor(env.SLACK_CONVERSATIONS_PAGE_SIZE)),
        200,
      );
      const result = await this.conversationsListWithRetry(client, {
        exclude_archived: true,
        types: "public_channel",
        limit: pageLimit,
        cursor: cursor,
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

      const nextCursor = result.response_metadata?.next_cursor;
      if (
        nextCursor &&
        fetchedRecords + channels.length < env.SLACK_FETCH_LIMIT
      ) {
        try {
          const nextPageChannels = await this.getChannelsRecursive(
            client,
            nextCursor,
            fetchedRecords + channels.length,
          );
          return [...channels, ...nextPageChannels];
        } catch (error) {
          logger.error(
            `Failed to retrieve next page of channels, returning only already fetched`,
            error,
          );
        }
      }
      return channels;
    } catch (error) {
      logger.error("Failed to fetch channels recursively", { error, cursor });
      throw new Error(
        `Failed to fetch channels: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get channels accessible to the bot
   */
  async getChannels(client: WebClient): Promise<SlackChannel[]> {
    try {
      const channels = await this.getChannelsRecursive(client);

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
  async sendMessage(params: SlackMessageParams): Promise<SlackMessageResponse> {
    try {
      const result = await params.client.chat.postMessage({
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
