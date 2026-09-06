import { type Redis, type Cluster } from "ioredis";

import { UnauthorizedError } from "@langfuse/shared";
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
import {
  type AuthorizationContext,
  type ErrorResult,
} from "@/src/features/auth/policy/types";

/** AuthenticatorCache is the read-through context cache keyed by credential; it owns key derivation and stores the Authenticator's resolved result. */
export class AuthenticatorCache {
  constructor(
    private readonly redis: Redis | Cluster | null = defaultRedis,
    private readonly salt: string = env.SALT,
  ) {}

  /** get returns the cached result for a credential, or null on a miss — distinct from a cached 401. */
  async get(credential: Credential): Promise<ResolveContextResult | null> {
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

  /** set persists a success context or a 401 under a fixed TTL, skips a 500 (fail open), and returns whether it wrote. */
  async set(
    credential: Credential,
    result: ApiKeyAuthResults,
  ): Promise<boolean> {
    const key = this.keyFor(credential);
    const entry = toEntry(result);
    const redis = this.redis;
    if (!key || !entry || !cacheEnabled(redis)) return false;
    try {
      await redis.set(
        key,
        JSON.stringify(entry),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS,
      );
      return true;
    } catch (error) {
      logger.error("authz context cache write failed", error);
      return false;
    }
  }

  /** keyFor derives the namespaced cache key from a credential's secret material, or null when uncacheable. */
  private keyFor(credential: Credential): string | null {
    if (credential.kind === "basic") {
      return createAuthzContextCacheKey(
        createShaHash(credential.secretKey, this.salt),
      );
    }
    if (credential.kind === "bearer") {
      return createAuthzContextCacheKey(
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

/** toEntry maps a resolved result to its cache row, yielding null for a 500 so it is never negatively cached. */
function toEntry(result: ApiKeyAuthResults): CachedEntry | null {
  if (result.success) return { context: result.context };
  if (result.error instanceof UnauthorizedError) {
    return { unauthorized: result.error.message };
  }
  return null;
}

/** deserialize reconstructs a cache hit from its stored row. */
function deserialize(entry: CachedEntry): ResolveContextResult {
  if ("context" in entry) return { success: true, context: entry.context };
  return { success: false, error: new UnauthorizedError(entry.unauthorized) };
}

/** ResolveContextResult is a cache hit: a resolved context or a replayed 401, never a 500. */
export type ResolveContextResult =
  | Authenticated
  | ErrorResult<UnauthorizedError>;

/** CachedEntry is the redis-serialized cache value: a materialized context, or a negative 401 body. */
type CachedEntry = { context: AuthorizationContext } | { unauthorized: string };
