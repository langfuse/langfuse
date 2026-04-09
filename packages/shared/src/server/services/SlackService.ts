/**
 * Slack Integration Service
 *
 * Simplified service that properly uses the official Slack SDK libraries:
 * - @slack/oauth InstallProvider for OAuth flow management
 * - @slack/web-api WebClient for Slack API operations
 * - Metadata-based project-to-team mapping
 */

import { WebClient, LogLevel } from "@slack/web-api";
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

/**
 * Emitted after each paginated `conversations.list` page while loading channels.
 * Slack does not return a total count; use {@link fetchLimit} as the configured upper bound.
 */
export type SlackChannelsFetchProgress = {
  pageNumber: number;
  channelsLoadedSoFar: number;
  lastPageChannelCount: number;
  hasMore: boolean;
  fetchLimit: number;
};

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

  /** Serialises slot acquisition for the sliding-window limiter (timestamps are not thread-safe). */
  private slackRateLimitAcquireChain: Promise<void> = Promise.resolve();
  /** Timestamps (ms) of Slack Web API calls started in the last 1s window. */
  private slackApiCallTimestamps: number[] = [];

  private constructor() {
    this.installer = new InstallProvider({
      clientId: env.SLACK_CLIENT_ID!,
      clientSecret: env.SLACK_CLIENT_SECRET!,
      stateSecret: env.SLACK_STATE_SECRET!,
      installUrlOptions: {
        scopes: [
          "channels:read",
          "groups:read",
          "chat:write",
          "chat:write.public",
        ],
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

      const client = new WebClient(auth.botToken, {
        // One in-flight HTTP per client; avoids burst traffic through the SDK queue.
        maxRequestConcurrency: 1,
        // Do not pause the SDK queue for Retry-After — we throttle and retry in this service.
        rejectRateLimitedCalls: true,
        // Suppress Slack SDK INFO/WARN spam on every 429 (http request failed / Will retry in N seconds).
        logLevel: LogLevel.ERROR,
        // Single HTTP attempt per call; conversationsListWithRetry / sendMessage handle backoff.
        retryConfig: { retries: 0 },
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
   * Waits until a new Slack Web API request may be started without exceeding
   * {@link env.SLACK_API_MAX_REQUESTS_PER_SECOND} per rolling second (per process).
   */
  private async waitForSlackApiSlot(): Promise<void> {
    const windowMs = 1000;
    const maxRps = env.SLACK_API_MAX_REQUESTS_PER_SECOND;
    for (;;) {
      const now = Date.now();
      this.slackApiCallTimestamps = this.slackApiCallTimestamps.filter(
        (t) => now - t < windowMs,
      );
      if (this.slackApiCallTimestamps.length < maxRps) {
        this.slackApiCallTimestamps.push(now);
        return;
      }
      const oldest = this.slackApiCallTimestamps[0]!;
      const waitMs = 1 + windowMs - (now - oldest);
      await sleep(Math.max(1, waitMs));
    }
  }

  /**
   * Enforces the global Slack Web API rate limit and serialises calls so only one
   * request runs at a time per process (avoids overlapping HTTP while the sliding
   * window only bounded *starts* per second).
   */
  private async withSlackRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.slackRateLimitAcquireChain;
    let releaseAcquire!: () => void;
    this.slackRateLimitAcquireChain = new Promise<void>((resolve) => {
      releaseAcquire = resolve;
    });
    await prev;
    try {
      await this.waitForSlackApiSlot();
      return await fn();
    } finally {
      releaseAcquire();
    }
  }

  private parseRetryAfterMs(error: unknown, depth = 0): number | null {
    if (!error || typeof error !== "object" || depth > 4) return null;
    const e = error as {
      retryAfter?: unknown;
      headers?: Record<string, string | string[] | undefined>;
      original?: unknown;
      cause?: unknown;
    };
    if (typeof e.retryAfter === "number" && !Number.isNaN(e.retryAfter)) {
      return Math.max(0, Math.floor(e.retryAfter * 1000));
    }
    const fromOriginal = this.parseRetryAfterMs(e.original, depth + 1);
    if (fromOriginal !== null) return fromOriginal;
    const fromCause = this.parseRetryAfterMs(e.cause, depth + 1);
    if (fromCause !== null) return fromCause;
    const h = e.headers;
    if (!h) return null;
    const raw = h["retry-after"] ?? h["Retry-After"];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === undefined || v === null) return null;
    const seconds = parseFloat(String(v));
    if (Number.isNaN(seconds)) return null;
    return Math.max(0, Math.floor(seconds * 1000));
  }

  private isSlackRateLimitError(error: unknown, depth = 0): boolean {
    if (!error || typeof error !== "object") return false;
    const e = error as Record<string, unknown>;
    if (e.code === "slack_webapi_rate_limited_error") return true;
    if (e.statusCode === 429) return true;
    if (e.code === "slack_webapi_platform_error") {
      const data = e.data as { error?: string } | undefined;
      if (data?.error === "rate_limited") return true;
    }
    const msg = String(e.message ?? "");
    if (msg.includes("rate_limited")) return true;
    if (msg.includes("statusCode = 429")) return true;
    if (depth < 4) {
      if (e.original) return this.isSlackRateLimitError(e.original, depth + 1);
      if (e.cause) return this.isSlackRateLimitError(e.cause, depth + 1);
    }
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
    onRateLimitBackoff?: (retryAfterSeconds: number) => void,
  ): Promise<Awaited<ReturnType<WebClient["conversations"]["list"]>>> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      try {
        const result = await this.withSlackRateLimit(() =>
          client.conversations.list(args),
        );
        if (result.ok) {
          return result;
        }
        if (result.error === "rate_limited") {
          const delayMs = this.getSlackRetryDelayMs(undefined, attempt);
          logger.debug(
            "Slack conversations.list returned rate_limited, retrying",
            {
              attempt: attempt + 1,
              delayMs,
              maxAttempts,
            },
          );
          onRateLimitBackoff?.(Math.max(1, Math.ceil(delayMs / 1000)));
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
        logger.debug("Slack conversations.list hit rate limit, retrying", {
          attempt: attempt + 1,
          delayMs,
          maxAttempts,
        });
        onRateLimitBackoff?.(Math.max(1, Math.ceil(delayMs / 1000)));
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
    onProgress: ((p: SlackChannelsFetchProgress) => void) | undefined,
    onRateLimitBackoff: ((seconds: number) => void) | undefined,
    cursor: string | undefined,
    fetchedRecords: number,
    pageNumber: number,
    types: "public_channel" | "public_channel,private_channel",
    slackTeamId: string | undefined,
  ): Promise<SlackChannel[]> {
    try {
      const pageLimit = Math.min(
        Math.max(1, Math.floor(env.SLACK_CONVERSATIONS_PAGE_SIZE)),
        200,
      );
      const result = await this.conversationsListWithRetry(
        client,
        {
          exclude_archived: true,
          types,
          limit: pageLimit,
          cursor: cursor,
          ...(slackTeamId ? { team_id: slackTeamId } : {}),
        },
        12,
        onRateLimitBackoff,
      );

      if (!result.ok) {
        const err = result.error ?? "unknown_error";
        if (
          cursor === undefined &&
          fetchedRecords === 0 &&
          pageNumber === 1 &&
          this.shouldRetryConversationsListPublicOnly(err, types)
        ) {
          return this.getChannelsRecursive(
            client,
            onProgress,
            onRateLimitBackoff,
            undefined,
            0,
            1,
            "public_channel",
            slackTeamId,
          );
        }
        throw new Error(`Slack API error: ${err}`);
      }

      const channels: SlackChannel[] = (result.channels || []).map(
        (channel) => ({
          id: channel.id!,
          name: channel.name!,
          isPrivate: channel.is_private || false,
          isMember: channel.is_member || false,
        }),
      );

      const loadedSoFar = fetchedRecords + channels.length;
      const nextCursor = result.response_metadata?.next_cursor;
      const hasMore = Boolean(
        nextCursor && loadedSoFar < env.SLACK_FETCH_LIMIT,
      );

      onProgress?.({
        pageNumber,
        channelsLoadedSoFar: loadedSoFar,
        lastPageChannelCount: channels.length,
        hasMore,
        fetchLimit: env.SLACK_FETCH_LIMIT,
      });

      if (hasMore) {
        try {
          const nextPageChannels = await this.getChannelsRecursive(
            client,
            onProgress,
            onRateLimitBackoff,
            nextCursor,
            loadedSoFar,
            pageNumber + 1,
            types,
            slackTeamId,
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
   * Normalise a user-entered channel name for comparison (trim, strip #, lowercase).
   */
  normalizeSlackChannelName(raw: string): string {
    return raw.trim().replace(/^#+/u, "").toLowerCase();
  }

  /** Match user input against Slack's name, name_normalized, and previous_names. */
  private slackConversationNameMatches(
    channel: {
      id?: string;
      name?: string;
      name_normalized?: string;
      previous_names?: (string | null | undefined)[] | null | undefined;
    },
    targetLower: string,
  ): boolean {
    if (!channel.id) {
      return false;
    }
    const candidates: string[] = [];
    if (channel.name) {
      candidates.push(channel.name);
    }
    if (channel.name_normalized) {
      candidates.push(channel.name_normalized);
    }
    for (const prev of channel.previous_names ?? []) {
      if (prev) {
        candidates.push(prev);
      }
    }
    return candidates.some(
      (n) => this.normalizeSlackChannelName(n) === targetLower,
    );
  }

  private shouldRetryConversationsListPublicOnly(
    err: string,
    types: "public_channel" | "public_channel,private_channel",
  ): boolean {
    return (
      types === "public_channel,private_channel" &&
      (err === "missing_scope" ||
        err === "not_allowed_token_type" ||
        err === "invalid_types")
    );
  }

  /**
   * Detect pasted Slack conversation IDs (C/G/D + digit + alphanumerics) without matching
   * channel names like "general" (second letter is not a digit).
   */
  private looksLikeSlackConversationId(raw: string): string | null {
    const s = raw.trim().replace(/^#+/u, "").toUpperCase();
    if (!/^[CGD]\d[A-Z0-9]{7,}$/.test(s)) {
      return null;
    }
    return s;
  }

  private async conversationsInfoWithRetry(
    client: WebClient,
    args: Parameters<WebClient["conversations"]["info"]>[0],
    maxAttempts = 12,
    onRateLimitBackoff?: (retryAfterSeconds: number) => void,
  ): Promise<Awaited<ReturnType<WebClient["conversations"]["info"]>>> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      try {
        const result = await this.withSlackRateLimit(() =>
          client.conversations.info(args),
        );
        if (result.ok) {
          return result;
        }
        if (result.error === "rate_limited") {
          const delayMs = this.getSlackRetryDelayMs(undefined, attempt);
          logger.debug(
            "Slack conversations.info returned rate_limited, retrying",
            {
              attempt: attempt + 1,
              delayMs,
              maxAttempts,
            },
          );
          onRateLimitBackoff?.(Math.max(1, Math.ceil(delayMs / 1000)));
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
        logger.debug("Slack conversations.info hit rate limit, retrying", {
          attempt: attempt + 1,
          delayMs,
          maxAttempts,
        });
        onRateLimitBackoff?.(Math.max(1, Math.ceil(delayMs / 1000)));
        await sleep(delayMs);
        attempt++;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Slack conversations.info failed after rate-limit retries");
  }

  private async tryGetChannelByConversationId(
    client: WebClient,
    channelId: string,
    onRateLimitBackoff?: (retryAfterSeconds: number) => void,
  ): Promise<SlackChannel | null> {
    const result = await this.conversationsInfoWithRetry(
      client,
      { channel: channelId },
      12,
      onRateLimitBackoff,
    );
    if (!result.ok || !result.channel?.id) {
      return null;
    }
    const c = result.channel;
    const id = c.id;
    if (!id) {
      return null;
    }
    return {
      id,
      name: c.name?.trim() || c.name_normalized?.trim() || channelId,
      isPrivate: c.is_private || false,
      isMember: c.is_member || false,
    };
  }

  private async findChannelByNameViaPaginatedList(
    client: WebClient,
    targetLower: string,
    excludeArchived: boolean,
    options?: {
      onRateLimitBackoff?: (retryAfterSeconds: number) => void;
      slackTeamId?: string;
    },
  ): Promise<SlackChannel | null> {
    const pageLimit = Math.min(
      Math.max(1, Math.floor(env.SLACK_CONVERSATIONS_PAGE_SIZE)),
      200,
    );
    let cursor: string | undefined;
    let fetched = 0;
    let types: "public_channel,private_channel" | "public_channel" =
      "public_channel,private_channel";
    let retriedPublicOnly = false;

    while (fetched < env.SLACK_FETCH_LIMIT) {
      const result = await this.conversationsListWithRetry(
        client,
        {
          exclude_archived: excludeArchived,
          types,
          limit: pageLimit,
          cursor,
          ...(options?.slackTeamId ? { team_id: options.slackTeamId } : {}),
        },
        12,
        options?.onRateLimitBackoff,
      );

      if (!result.ok) {
        const err = result.error ?? "unknown_error";
        if (
          !retriedPublicOnly &&
          this.shouldRetryConversationsListPublicOnly(err, types)
        ) {
          retriedPublicOnly = true;
          types = "public_channel";
          cursor = undefined;
          fetched = 0;
          continue;
        }
        throw new Error(`Slack API error: ${err}`);
      }

      const page = result.channels || [];
      const hit = page.find((c) =>
        this.slackConversationNameMatches(c, targetLower),
      );
      if (hit?.id) {
        const displayName =
          hit.name?.trim() || hit.name_normalized?.trim() || targetLower;
        return {
          id: hit.id,
          name: displayName,
          isPrivate: hit.is_private || false,
          isMember: hit.is_member || false,
        };
      }

      fetched += page.length;
      const next = result.response_metadata?.next_cursor;
      if (!next) {
        break;
      }
      cursor = next;
    }

    return null;
  }

  /**
   * Resolve a public channel handle when list pagination misses it (e.g. large workspaces).
   * Slack accepts `#handle` in chat.postMessage for public channels and returns the canonical ID;
   * we delete the probe immediately.
   *
   * We do not use search.all: it requires a user token with search:read, not a bot token.
   *
   * Set SLACK_CHANNEL_LOOKUP_DISABLE_POST_MESSAGE_PROBE=true to skip (no transient in-channel
   * activity; some clients may still briefly notify).
   */
  private async findChannelByHandleViaPostMessageProbe(
    client: WebClient,
    handleLower: string,
    onRateLimitBackoff?: (retryAfterSeconds: number) => void,
  ): Promise<SlackChannel | null> {
    if (env.SLACK_CHANNEL_LOOKUP_DISABLE_POST_MESSAGE_PROBE === "true") {
      return null;
    }

    const postProbe = async (
      channelSpec: string,
    ): Promise<Awaited<ReturnType<WebClient["chat"]["postMessage"]>>> => {
      return await this.withSlackRateLimit(() =>
        client.chat.postMessage({
          channel: channelSpec,
          text: ".",
          unfurl_links: false,
          unfurl_media: false,
        }),
      );
    };

    let res = await postProbe(`#${handleLower}`);
    if (!res.ok && res.error === "channel_not_found") {
      res = await postProbe(handleLower);
    }

    if (!res.ok || !res.channel || !res.ts) {
      return null;
    }

    const channelId = res.channel;
    const ts = res.ts;

    try {
      const del = await this.withSlackRateLimit(() =>
        client.chat.delete({ channel: channelId, ts }),
      );
      if (!del.ok) {
        logger.warn(
          "Slack channel lookup: chat.delete failed after probe post",
          {
            error: del.error,
            channelId,
          },
        );
      }
    } catch (error) {
      logger.warn("Slack channel lookup: chat.delete threw after probe post", {
        error,
        channelId,
      });
    }

    return this.tryGetChannelByConversationId(
      client,
      channelId,
      onRateLimitBackoff,
    );
  }

  /**
   * Find a channel the bot can access: by conversation ID (pasted C…/G…/D…), or by exact
   * handle via paginated conversations.list (archived included on a second pass if needed).
   */
  async findChannelByName(
    client: WebClient,
    rawName: string,
    options?: {
      onRateLimitBackoff?: (retryAfterSeconds: number) => void;
      /** Encoded Slack team id; required for org-level tokens, ignored for workspace tokens. */
      slackTeamId?: string;
    },
  ): Promise<SlackChannel | null> {
    const idCandidate = this.looksLikeSlackConversationId(rawName);
    if (idCandidate) {
      const byId = await this.tryGetChannelByConversationId(
        client,
        idCandidate,
        options?.onRateLimitBackoff,
      );
      if (byId) {
        return byId;
      }
    }

    const target = this.normalizeSlackChannelName(rawName);
    if (!target) {
      return null;
    }

    const listOpts = {
      onRateLimitBackoff: options?.onRateLimitBackoff,
      slackTeamId: options?.slackTeamId,
    };

    const active = await this.findChannelByNameViaPaginatedList(
      client,
      target,
      true,
      listOpts,
    );
    if (active) {
      return active;
    }

    const fromListIncludingArchived =
      await this.findChannelByNameViaPaginatedList(
        client,
        target,
        false,
        listOpts,
      );
    if (fromListIncludingArchived) {
      return fromListIncludingArchived;
    }

    return await this.findChannelByHandleViaPostMessageProbe(
      client,
      target,
      options?.onRateLimitBackoff,
    );
  }

  /**
   * Get channels accessible to the bot
   */
  async getChannels(
    client: WebClient,
    options?: {
      onProgress?: (p: SlackChannelsFetchProgress) => void;
      onRateLimitBackoff?: (retryAfterSeconds: number) => void;
      /** Encoded Slack team id; required for org-level tokens, ignored for workspace tokens. */
      slackTeamId?: string;
    },
  ): Promise<SlackChannel[]> {
    try {
      const channels = await this.getChannelsRecursive(
        client,
        options?.onProgress,
        options?.onRateLimitBackoff,
        undefined,
        0,
        1,
        "public_channel,private_channel",
        options?.slackTeamId,
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
  async sendMessage(params: SlackMessageParams): Promise<SlackMessageResponse> {
    try {
      const result = await this.withSlackRateLimit(() =>
        params.client.chat.postMessage({
          channel: params.channelId,
          blocks: params.blocks,
          text: params.text || "Langfuse Notification",
          unfurl_links: false,
          unfurl_media: false,
        }),
      );

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
      const result = await this.withSlackRateLimit(() => client.auth.test());
      return result.ok || false;
    } catch (error) {
      logger.warn("Client validation failed", { error });
      return false;
    }
  }
}
