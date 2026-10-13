import { type Redis, type Cluster } from "ioredis";

import {
  redis as defaultRedis,
  createShaHash,
  createAuthzContextCacheKey,
  logger,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type Credential } from "@/src/features/apiKey/helpers/parseAuthorizationHeader";
import {
  type ApiKeyAuthResults,
  type Authenticated,
} from "@/src/features/apiKey/authenticator";
import { matchesAdminApiKey } from "@/src/features/apiKey/helpers/matchesAdminApiKey";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

/** AuthenticatorCache stores authorization contexts by credential. */
export class AuthenticatorCache {
  constructor(
    private readonly redis: Redis | Cluster | null = defaultRedis,
    private readonly salt: string = env.SALT,
    private readonly adminApiKey: string | undefined = env.ADMIN_API_KEY,
  ) {}

  /** get returns a cached context, or null on a miss. */
  async get(credential: Credential): Promise<Authenticated | null> {
    const key = this.keyFor(credential);
    const redis = this.redis;
    if (!key || !cacheEnabled(redis)) return null;
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return deserialize(JSON.parse(raw) as CachedEntry);
    } catch (error) {
      logger.error("authz context cache read failed, falling open", error);
      return null;
    }
  }

  /** set caches database-key successes until their TTL or expiry. */
  async set(
    credential: Credential,
    result: ApiKeyAuthResults,
    expiresAt: Date | null = null,
  ): Promise<boolean> {
    const key = this.keyFor(credential);
    if (!result.success || result.context.principal.kind === "admin") {
      return false;
    }
    const ttlSeconds = ttlFor(expiresAt);
    const redis = this.redis;
    if (!key || ttlSeconds <= 0 || !cacheEnabled(redis)) {
      return false;
    }
    try {
      await redis.set(
        key,
        JSON.stringify({ context: result.context }),
        "EX",
        ttlSeconds,
      );
      return true;
    } catch (error) {
      logger.error("authz context cache write failed", error);
      return false;
    }
  }

  /** keyFor derives credential cache keys, excluding environment admins. */
  private keyFor(credential: Credential): string | null {
    if (credential.kind === "basic") {
      return createAuthzContextCacheKey(
        "basic",
        createShaHash(credential.secretKey, this.salt),
      );
    }
    if (credential.kind === "bearer") {
      if (matchesAdminApiKey(credential.token, this.adminApiKey)) return null;
      return createAuthzContextCacheKey(
        "bearer",
        createShaHash(credential.token, this.salt),
      );
    }
    return null;
  }
}

/** cacheEnabled is the shared on/off switch for the context cache, reusing the legacy api-key cache flag. */
function cacheEnabled(redis: Redis | Cluster | null): redis is Redis | Cluster {
  return Boolean(redis) && env.LANGFUSE_CACHE_API_KEY_ENABLED === "true";
}

/** ttlFor is the cache TTL in seconds, floored to the key's remaining lifetime so an entry never outlives its key. */
function ttlFor(expiresAt: Date | null): number {
  const ttl = env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS;
  if (!expiresAt) return ttl;
  return Math.min(ttl, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

function deserialize(entry: CachedEntry): Authenticated | null {
  if (!entry?.context) return null;
  return { success: true, context: entry.context };
}

type CachedEntry = { context: AuthorizationContext };
