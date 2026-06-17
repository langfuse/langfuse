/**
 * Slack Integration Service
 *
 * Simplified service that properly uses the official Slack SDK libraries:
 * - @slack/oauth InstallProvider for OAuth flow management
 * - @slack/web-api WebClient for Slack API operations
 * - Metadata-based project-to-team mapping
 */

import { createHash, randomBytes } from "node:crypto";
import { WebClient } from "@slack/web-api";
import { InstallProvider } from "@slack/oauth";
import { logger } from "../logger";
import { env } from "../../env";
import { prisma } from "../../db";
import { encrypt, decrypt } from "../../encryption";

/**
 * Error thrown by SlackService when a Slack API call fails.
 * Preserves the Slack error code so callers can provide user-friendly messages.
 */
export class SlackApiError extends Error {
  constructor(
    message: string,
    public readonly slackErrorCode?: string,
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

/** OAuth scopes requested when installing the Slack app. */
export const SLACK_BOT_SCOPES = [
  "channels:read", // read public channels
  "groups:read", // read private channels that the bot is a member of
  "chat:write", // send messages to channels the bot is a member of
  "chat:write.public", // send messages to public channels that the bot is not a member of
] as const;

/**
 * How long an unlinked Marketplace installation is held before being purged.
 * Short because the row holds a bot token; the user links it to a project in the
 * onboarding flow within this window.
 */
export const SLACK_PENDING_INSTALL_TTL_MS = 15 * 60 * 1000; // 15 minutes

const generatePendingInstallClaimToken = () =>
  randomBytes(32).toString("base64url");

export const hashSlackPendingInstallClaimToken = (claimToken: string) =>
  createHash("sha256").update(claimToken).digest("hex");

// Types for Slack integration
export interface SlackChannel {
  id: string;
  name: string;
  isPrivate?: boolean;
  isMember?: boolean;
}

export interface GetChannelsResult {
  channels: SlackChannel[];
  hasPrivateChannelAccess: boolean;
}

/** SlackMessage is the Block Kit payload sent to Slack. */
export interface SlackMessage {
  blocks: any[];
  text?: string;
  attachments?: { color: string; fallback?: string; blocks?: any[] }[];
}

export interface SlackMessageParams extends SlackMessage {
  client: WebClient;
  channelId: string;
}

/** escapeSlackMrkdwn escapes Slack mrkdwn special characters to prevent injection. */
export function escapeSlackMrkdwn(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
 * Lenient variant of parseSlackInstallationMetadata. Returns the projectId when
 * the OAuth metadata carries one (in-app "Connect" flow), or undefined for
 * Marketplace installs that complete OAuth before a project is chosen.
 */
export function tryGetProjectIdFromMetadata(
  metadata: unknown,
): string | undefined {
  if (typeof metadata !== "string" || metadata.length === 0) return undefined;
  try {
    const parsed = JSON.parse(metadata);
    return isSlackInstallationMetadata(parsed) ? parsed.projectId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Column set shared by the two paths that link a Slack workspace to a project:
 * the in-app "Connect" install and the Marketplace link step. botToken must
 * already be encrypted.
 */
function projectInstallationFields(params: {
  teamId: string;
  teamName: string;
  encryptedBotToken: string;
  botUserId: string;
}) {
  return {
    teamId: params.teamId,
    teamName: params.teamName,
    botToken: params.encryptedBotToken,
    botUserId: params.botUserId,
    installingSlackUserId: null,
    expiresAt: null,
    claimTokenHash: null,
  };
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
      // 302 straight to Slack's authorize URL (Marketplace "Direct Install URL"
      // behavior) instead of rendering an intermediate "Add to Slack" page. Both
      // flows go through handleInstallPath, which sets the OAuth state cookie
      // that handleCallback verifies.
      directInstall: true,
      installUrlOptions: {
        scopes: SLACK_BOT_SCOPES as unknown as string[],
      },
      installationStore: {
        storeInstallation: async (installation) => {
          try {
            const projectId = tryGetProjectIdFromMetadata(
              installation.metadata,
            );
            const teamId = installation.team?.id;
            const teamName = installation.team?.name;
            const botToken = installation.bot?.token;
            const botUserId = installation.bot?.userId;

            if (!teamId || !teamName || !botToken || !botUserId) {
              throw new Error(
                "Incomplete Slack installation payload (missing team or bot details)",
              );
            }

            if (projectId) {
              // In-app "Connect" flow: the project is known up front (passed via
              // OAuth metadata), so link directly. One integration per project.
              const fields = projectInstallationFields({
                teamId,
                teamName,
                encryptedBotToken: encrypt(botToken),
                botUserId,
              });
              await prisma.slackIntegration.upsert({
                where: { projectId },
                create: { projectId, ...fields },
                update: fields,
              });

              logger.info("Slack installation stored for project", {
                projectId,
                teamId,
              });
            } else {
              // Marketplace flow: no project yet (the Direct Install URL must
              // 302 straight to OAuth). Hold the install as a pending row until
              // the onboarding flow links it to a project. There is no team_id
              // uniqueness, so emulate latest-wins by clearing prior pending
              // rows for this workspace before inserting the new one.
              // Latest-wins: drop any prior pending install for this workspace
              // (projectId: null guards linked rows), then store the fresh one.
              await prisma.$transaction([
                prisma.slackIntegration.deleteMany({
                  where: { teamId, projectId: null },
                }),
                prisma.slackIntegration.create({
                  data: {
                    projectId: null,
                    teamId,
                    teamName,
                    botToken: encrypt(botToken),
                    botUserId,
                    installingSlackUserId: installation.user?.id,
                    expiresAt: new Date(
                      Date.now() + SLACK_PENDING_INSTALL_TTL_MS,
                    ),
                  },
                }),
              ]);

              // Opportunistically purge other workspaces' expired pending rows
              // so abandoned installs can't accumulate (no dedicated cron; reads
              // also filter on expiry). Reuses the shared cleanup query.
              await this.deleteExpiredPendingInstallations();

              logger.info("Slack installation stored as pending (no project)", {
                teamId,
              });
            }
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
                // Only resolve linked installations; a pending (unlinked) row
                // must never be returned as an active integration.
                projectId: { not: null },
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
   * Get the current (non-expired) pending installation for a Slack workspace.
   * Used by the Marketplace onboarding flow to show which workspace is being
   * linked. Returns null if there is no pending install or it has expired.
   */
  async getPendingInstallation(teamId: string): Promise<{
    teamId: string;
    teamName: string;
    expiresAt: Date | null;
  } | null> {
    return prisma.slackIntegration.findFirst({
      where: { teamId, projectId: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { teamId: true, teamName: true, expiresAt: true },
    });
  }

  /**
   * Get pending installation details only when the caller presents the one-time
   * claim token issued by the OAuth callback.
   */
  async getClaimedPendingInstallation(
    teamId: string,
    claimToken: string,
  ): Promise<{
    teamId: string;
    teamName: string;
    expiresAt: Date | null;
  } | null> {
    // Enforce the claim in the query: a workspace can have several pending
    // installs (multiple people in the same org), so match on teamId AND the
    // claim hash to return the right row, rather than fetching the latest and
    // comparing the hash in app code. A null claimTokenHash never matches.
    return prisma.slackIntegration.findFirst({
      where: {
        teamId,
        projectId: null,
        expiresAt: { gt: new Date() },
        claimTokenHash: hashSlackPendingInstallClaimToken(claimToken),
      },
      orderBy: { createdAt: "desc" },
      select: {
        teamId: true,
        teamName: true,
        expiresAt: true,
      },
    });
  }

  /**
   * Issue a one-time claim token for the latest active pending installation.
   * Only the hash is stored; the raw token is carried by the onboarding URL and
   * required when the user links the install to a project.
   */
  async issuePendingInstallationClaim(teamId: string): Promise<string | null> {
    const pending = await prisma.slackIntegration.findFirst({
      where: { teamId, projectId: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!pending) return null;

    const claimToken = generatePendingInstallClaimToken();
    await prisma.slackIntegration.update({
      where: { id: pending.id },
      data: {
        claimTokenHash: hashSlackPendingInstallClaimToken(claimToken),
      },
    });

    return claimToken;
  }

  /**
   * Link a pending (unlinked) Marketplace installation to a project. Moves the
   * pending row in place: sets projectId and clears the pending-only fields. If
   * the project already has an integration it is replaced (the new install
   * wins). Returns the linked integration, or null if no valid pending install
   * exists for the workspace.
   */
  async linkPendingInstallation(
    teamId: string,
    projectId: string,
    claimToken: string,
  ): Promise<{ id: string; teamId: string; teamName: string } | null> {
    const linked = await prisma.$transaction(async (tx) => {
      // Resolve the pending row inside the transaction so the claim + expiry are
      // validated atomically with the link — no TOCTOU window where the row
      // could expire or be purged between the check and the write. Enforced in
      // the query (see getClaimedPendingInstallation): match on teamId AND the
      // claim hash so the right row is linked even when several exist.
      const pending = await tx.slackIntegration.findFirst({
        where: {
          teamId,
          projectId: null,
          expiresAt: { gt: new Date() },
          claimTokenHash: hashSlackPendingInstallClaimToken(claimToken),
        },
        orderBy: { createdAt: "desc" },
      });
      if (!pending) return null;

      // Upsert the integration for the project (same shape as the in-app
      // "Connect" path), copying the already-encrypted token from the pending
      // row, then consume all pending rows for this workspace.
      const fields = projectInstallationFields({
        teamId: pending.teamId,
        teamName: pending.teamName,
        encryptedBotToken: pending.botToken,
        botUserId: pending.botUserId,
      });
      const result = await tx.slackIntegration.upsert({
        where: { projectId },
        create: { projectId, ...fields },
        update: fields,
      });
      await tx.slackIntegration.deleteMany({
        where: { teamId, projectId: null },
      });
      return result;
    });

    if (!linked) return null;

    logger.info("Linked pending Slack installation to project", {
      teamId,
      projectId,
    });
    return { id: linked.id, teamId: linked.teamId, teamName: linked.teamName };
  }

  /**
   * Purge expired pending (unlinked) installations. The projectId IS NULL guard
   * is mandatory so this can never delete a linked integration.
   */
  async deleteExpiredPendingInstallations(
    now: Date = new Date(),
  ): Promise<number> {
    const { count } = await prisma.slackIntegration.deleteMany({
      where: { projectId: null, expiresAt: { lt: now } },
    });
    if (count > 0) {
      logger.info("Purged expired pending Slack installations", { count });
    }
    return count;
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

      const client = new WebClient(auth.botToken, {
        retryConfig: { retries: 3, maxRetryTime: 90_000 },
      });
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
   * Recursively fetch all channels accessible to the bot
   * Uses cursor-based pagination defined by Slack API https://api.slack.com/apis/pagination
   */
  private async getChannelsRecursive(
    client: WebClient,
    channelTypes: string = "public_channel,private_channel",
    cursor?: string,
    fetchedRecords: number = 0,
  ): Promise<SlackChannel[]> {
    try {
      const result = await client.conversations.list({
        exclude_archived: true,
        types: channelTypes,
        limit: env.SLACK_PAGE_SIZE,
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
            channelTypes,
            nextCursor,
            fetchedRecords + channels.length,
          );
          return channels.concat(nextPageChannels);
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
      throw error;
    }
  }

  /**
   * Get channels accessible to the bot.
   */
  async getChannels(client: WebClient): Promise<GetChannelsResult> {
    try {
      const channels = await this.getChannelsRecursive(
        client,
        "public_channel,private_channel",
      );

      logger.debug("Retrieved channels from Slack", {
        channelCount: channels.length,
      });

      return { channels, hasPrivateChannelAccess: true };
    } catch (error: any) {
      // we added `groups:read` scope after initial release, so older installations may not have it.
      // Detect this case and fall back to fetching only public channels instead of failing completely.
      const isMissingGroupsRead =
        error?.data?.error === "missing_scope" &&
        error?.data?.needed === "groups:read";

      if (isMissingGroupsRead) {
        logger.info(
          "Bot token lacks groups:read scope, falling back to public channels only",
        );

        try {
          const channels = await this.getChannelsRecursive(
            client,
            "public_channel",
          );

          return { channels, hasPrivateChannelAccess: false };
        } catch (fallbackError) {
          logger.error("Failed to fetch public channels fallback", {
            error: fallbackError,
          });
          throw new Error(
            `Failed to fetch channels: ${fallbackError instanceof Error ? fallbackError.message : "Unknown error"}`,
          );
        }
      }

      logger.error("Failed to fetch channels", { error });
      throw new Error(
        `Failed to fetch channels: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get channel info by ID via conversations.info.
   */
  async getChannelInfo(
    client: WebClient,
    channelId: string,
  ): Promise<SlackChannel | null> {
    try {
      const result = await client.conversations.info({ channel: channelId });
      if (!result.ok || !result.channel) return null;
      return {
        id: result.channel.id!,
        name: result.channel.name!,
        isPrivate: result.channel.is_private || false,
        isMember: result.channel.is_member || false,
      };
    } catch (error) {
      logger.warn("Failed to fetch channel info", { error, channelId });
      return null;
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
        attachments: params.attachments as any,
        text:
          params.text ||
          (params.blocks?.length || params.attachments?.length
            ? undefined
            : "Langfuse Notification"),
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
    } catch (error: any) {
      logger.error("Failed to send message", {
        error,
        channelId: params.channelId,
      });

      const slackErrorCode = error?.data?.error as string | undefined;
      throw new SlackApiError(
        `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
        slackErrorCode,
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
