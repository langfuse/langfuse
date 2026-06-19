import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { type Cluster, type Redis } from "ioredis";
import { type NextApiRequest } from "next";

import { env } from "@/src/env.mjs";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  createNewRedisInstance,
  logger,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";

const KEY_PREFIX = "rate-limit:slack-marketplace-install";
const POINTS = 30; // requests per window, per client IP
const DURATION_SECONDS = 5 * 60;

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  // Use the rightmost X-Forwarded-For entry: it is appended by the last trusted
  // proxy hop and cannot be forged by the client. The leftmost entry is
  // client-supplied and trivially spoofable to rotate IPs and dodge the limit.
  const last =
    typeof forwarded === "string"
      ? forwarded.split(",").at(-1)
      : Array.isArray(forwarded)
        ? forwarded.at(-1)
        : undefined;
  return last?.trim() || req.socket.remoteAddress || "unknown";
}

/**
 * Per-IP rate limit for the public Slack marketplace install endpoint.
 *
 * Fails open: when rate limiting is disabled, Redis isn't configured, or Redis
 * is unavailable, requests are allowed. The endpoint is a DB-free redirect, so
 * this is defense-in-depth against floods rather than protection of an expensive
 * resource — better to let installs through than to block them on an infra blip.
 *
 * Redis is injectable via getInstance(redis) (pass null to disable), which makes
 * the limiter unit-testable without reaching into module internals.
 */
export class SlackMarketplaceInstallRateLimiter {
  private static instance: SlackMarketplaceInstallRateLimiter | null = null;

  private readonly redis: Redis | Cluster | null;
  private readonly limiter: RateLimiterRedis | null;
  private connectPromise: Promise<void> | null = null;

  private constructor(redis: Redis | Cluster | null) {
    this.redis = redis;
    this.limiter = redis
      ? new RateLimiterRedis({
          storeClient: redis,
          keyPrefix: KEY_PREFIX,
          points: POINTS,
          duration: DURATION_SECONDS,
          rejectIfRedisNotReady: true,
        })
      : null;
  }

  static getInstance(
    redis?: Redis | Cluster | null,
  ): SlackMarketplaceInstallRateLimiter {
    if (
      SlackMarketplaceInstallRateLimiter.instance === null ||
      redis !== undefined
    ) {
      const client =
        redis !== undefined
          ? redis
          : createNewRedisInstance({
              keyPrefix: sharedEnv.REDIS_KEY_PREFIX ?? undefined,
              enableAutoPipelining: false,
              enableOfflineQueue: false,
              lazyConnect: true,
              ...redisQueueRetryOptions,
            });
      SlackMarketplaceInstallRateLimiter.instance =
        new SlackMarketplaceInstallRateLimiter(client);
    }
    return SlackMarketplaceInstallRateLimiter.instance;
  }

  /** Disconnect Redis and drop the cached instance (graceful shutdown / tests). */
  static shutdown(): void {
    const instance = SlackMarketplaceInstallRateLimiter.instance;
    if (instance?.redis && instance.redis.status !== "end") {
      instance.redis.disconnect();
    }
    SlackMarketplaceInstallRateLimiter.instance = null;
  }

  /** True if the request may proceed, false if it should be rejected with 429. */
  async allow(req: NextApiRequest): Promise<boolean> {
    if (env.LANGFUSE_RATE_LIMITS_ENABLED === "false") return true;
    if (!this.limiter || !this.redis) return true;

    try {
      await this.ensureReady(this.redis);
      await this.limiter.consume(getClientIp(req));
      return true;
    } catch (error) {
      if (error instanceof RateLimiterRes) return false;
      // Redis unavailable / unexpected -> fail open.
      logger.warn("Slack marketplace install rate limiter unavailable", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return true;
    }
  }

  private async ensureReady(client: Redis | Cluster): Promise<void> {
    if (client.status === "ready") return;
    this.connectPromise ??= client.connect().finally(() => {
      this.connectPromise = null;
    });
    await this.connectPromise;
  }
}

/** Convenience wrapper used by the route handler. */
export const allowSlackMarketplaceInstall = (req: NextApiRequest) =>
  SlackMarketplaceInstallRateLimiter.getInstance().allow(req);
