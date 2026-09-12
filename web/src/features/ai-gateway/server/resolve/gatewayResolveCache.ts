import {
  logger,
  recordIncrement,
  redis as defaultRedis,
} from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
// Imported from the registry rather than the provider barrel: the barrel pulls
// in the provider services, which invalidate this cache, and the resulting
// import cycle leaves these schemas undefined at module init.
import {
  GatewayMetadataSchema,
  gatewayApiFormats,
} from "@/src/features/ai-gateway/server/provider/registry";

const CACHE_PREFIX = "ai-gateway:resolve";

/**
 * Marker for a secret key that no gateway API key matches. Cached like a hit so
 * that a client looping on a bad key cannot generate unbounded Postgres load.
 */
export const GATEWAY_RESOLVE_KEY_NON_EXISTENT = "gateway-key-non-existent";

export const CachedResolveContext = z.object({
  organizationId: z.string(),
  apiKeyId: z.string(),
  keyMetadata: GatewayMetadataSchema,
  ingestionProjectId: z.string().nullable(),
  ingestionMode: z.enum(["USAGE", "FULL"]).nullable(),
  connection: z
    .object({
      id: z.string(),
      provider: z.enum(["OPENAI", "ANTHROPIC"]),
      encryptedCredential: z.string(),
    })
    .nullable(),
});
export type CachedResolveContext = z.infer<typeof CachedResolveContext>;

const CachedResolveEntry = z.union([
  CachedResolveContext,
  z.literal(GATEWAY_RESOLVE_KEY_NON_EXISTENT),
]);

const contextCacheKey = (fastHashedSecretKey: string, apiFormat: string) =>
  `${CACHE_PREFIX}:context:${apiFormat}:${fastHashedSecretKey}`;

/**
 * Index of the cache keys written for one organization. Entries are keyed by
 * secret-key hash, which an organization-level change (a new connection, a
 * different ingestion project) cannot enumerate on its own.
 */
const organizationIndexKey = (organizationId: string) =>
  `${CACHE_PREFIX}:org:${organizationId}`;

/**
 * Caches the /resolve lookup. Every failure is swallowed: a Redis outage must
 * degrade the gateway to Postgres reads, never take it down.
 */
export class GatewayResolveCache {
  constructor(private readonly redis: Redis | Cluster | null = defaultRedis) {}

  private get enabled() {
    return (
      this.redis !== null &&
      env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED === "true"
    );
  }

  async get(params: { fastHashedSecretKey: string; apiFormat: string }) {
    if (!this.enabled) return null;

    try {
      const cached = await this.redis!.get(
        contextCacheKey(params.fastHashedSecretKey, params.apiFormat),
      );
      if (!cached) {
        recordIncrement("langfuse.gateway.resolve.cache_miss", 1);
        return null;
      }

      const parsed = CachedResolveEntry.safeParse(JSON.parse(cached));
      if (!parsed.success) {
        // A shape change between deployments must not serve stale garbage.
        await this.redis!.del(
          contextCacheKey(params.fastHashedSecretKey, params.apiFormat),
        );
        recordIncrement("langfuse.gateway.resolve.cache_miss", 1);
        return null;
      }

      recordIncrement("langfuse.gateway.resolve.cache_hit", 1);
      return parsed.data;
    } catch (error) {
      logger.error("Error reading gateway resolve cache", error);
      return null;
    }
  }

  async set(params: {
    fastHashedSecretKey: string;
    apiFormat: string;
    context: CachedResolveContext | typeof GATEWAY_RESOLVE_KEY_NON_EXISTENT;
  }) {
    if (!this.enabled) return;

    const key = contextCacheKey(params.fastHashedSecretKey, params.apiFormat);
    const ttl = env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_TTL_SECONDS;
    try {
      if (params.context === GATEWAY_RESOLVE_KEY_NON_EXISTENT) {
        await this.redis!.set(key, JSON.stringify(params.context), "EX", ttl);
        return;
      }

      // These keys can live in different Redis Cluster slots, so issue the
      // commands separately instead of wrapping them in one transaction.
      const index = organizationIndexKey(params.context.organizationId);
      await Promise.all([
        this.redis!.set(key, JSON.stringify(params.context), "EX", ttl),
        this.redis!.sadd(index, key),
        // The index must outlive its entries, otherwise invalidation can miss a
        // cached key that is still live.
        this.redis!.expire(index, ttl * 2),
      ]);
    } catch (error) {
      logger.error("Error writing gateway resolve cache", error);
    }
  }

  /**
   * Drops every cached resolve context for an organization. Call this after any
   * change that alters what /resolve would answer: connections, credentials,
   * routing priority, connection status, or the gateway config.
   */
  async invalidateOrganization(organizationId: string) {
    if (!this.enabled) return;

    try {
      const index = organizationIndexKey(organizationId);
      const keys = await this.redis!.smembers(index);
      await Promise.all([
        this.redis!.del(index),
        ...keys.map((key) => this.redis!.del(key)),
      ]);
    } catch (error) {
      logger.error("Error invalidating gateway resolve cache", error);
    }
  }

  /** Drops the cached contexts for a single gateway API key, e.g. on revoke. */
  async invalidateApiKey(fastHashedSecretKey: string) {
    if (!this.enabled) return;

    try {
      await Promise.all(
        gatewayApiFormats.map((apiFormat) =>
          this.redis!.del(contextCacheKey(fastHashedSecretKey, apiFormat)),
        ),
      );
    } catch (error) {
      logger.error("Error invalidating gateway resolve cache", error);
    }
  }
}

export const invalidateGatewayResolveCacheForOrganization = (
  organizationId: string,
) => new GatewayResolveCache().invalidateOrganization(organizationId);

export const invalidateGatewayResolveCacheForApiKey = (
  fastHashedSecretKey: string,
) => new GatewayResolveCache().invalidateApiKey(fastHashedSecretKey);
