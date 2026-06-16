import { TRPCError } from "@trpc/server";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { type Cluster, type Redis } from "ioredis";

import { env } from "@/src/env.mjs";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  createNewRedisInstance,
  logger,
  recordIncrement,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";

export const WEB_CALLOUT_RATE_LIMIT_REDIS_KEY_PREFIX =
  "rate-limit:web-callout-invoke";

const REDIS_RETRY_COOLDOWN_MS = 5_000;
const WEB_CALLOUT_RATE_LIMIT_USER_POINTS = 10;
const WEB_CALLOUT_RATE_LIMIT_ENDPOINT_POINTS = 60;
const WEB_CALLOUT_RATE_LIMIT_DURATION_SECONDS = 60;
const WEB_CALLOUT_MAX_IN_FLIGHT_PER_PROCESS = 25;
const WEB_CALLOUT_MAX_IN_FLIGHT_PER_ENDPOINT = 5;

export type WebCalloutLimitContext = {
  orgId: string;
  projectId: string;
  endpointId: string;
  userId: string;
};

type WebCalloutMetricOutcome =
  | "attempted"
  | "sent"
  | "failed"
  | "timed_out"
  | "rate_limited"
  | "rate_limit_unavailable"
  | "concurrency_rejected";

const redisStatus = (redis: Redis | Cluster) =>
  "status" in redis ? redis.status : undefined;

const getRetryAfterSeconds = (msBeforeNext: number | undefined) =>
  Math.max(1, Math.ceil((msBeforeNext ?? 1000) / 1000));

const limitKey = ({
  orgId,
  projectId,
  endpointId,
  userId,
}: WebCalloutLimitContext) => ({
  endpoint: `${orgId}:${projectId}:${endpointId}`,
  user: `${orgId}:${projectId}:${endpointId}:${userId}`,
});

const tooManyRequests = (message: string, retryAfterSeconds?: number) =>
  new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message:
      retryAfterSeconds === undefined
        ? message
        : `${message} Please retry in ${retryAfterSeconds} seconds.`,
  });

export const recordWebCalloutInvokeMetric = (
  outcome: WebCalloutMetricOutcome,
  context: WebCalloutLimitContext,
) => {
  recordIncrement("langfuse.web_callout.invoke", 1, {
    outcome,
    orgId: context.orgId,
    projectId: context.projectId,
    endpointId: context.endpointId,
  });
};

export class WebCalloutRateLimitService {
  private static instance: WebCalloutRateLimitService | null = null;
  private static redis: Redis | Cluster | null = null;

  private redisUnavailableUntilMs = 0;
  private redisConnectPromise: Promise<void> | null = null;

  public static getInstance(redis?: Redis | Cluster | null) {
    if (!WebCalloutRateLimitService.instance || redis !== undefined) {
      WebCalloutRateLimitService.redis =
        redis !== undefined
          ? redis
          : createNewRedisInstance({
              keyPrefix: sharedEnv.REDIS_KEY_PREFIX ?? undefined,
              enableAutoPipelining: false,
              enableOfflineQueue: false,
              lazyConnect: true,
              ...redisQueueRetryOptions,
            });
      WebCalloutRateLimitService.instance = new WebCalloutRateLimitService();
    }

    return WebCalloutRateLimitService.instance;
  }

  public static shutdown() {
    const redis = WebCalloutRateLimitService.redis;
    if (redis && redisStatus(redis) !== "end") {
      redis.disconnect();
    }
    WebCalloutRateLimitService.redis = null;
    WebCalloutRateLimitService.instance = null;
  }

  public async consume(context: WebCalloutLimitContext) {
    if (env.LANGFUSE_RATE_LIMITS_ENABLED === "false") {
      return;
    }

    const redis = WebCalloutRateLimitService.redis;

    if (!redis) {
      this.failClosed(context, "Redis is not configured for web callouts");
    }

    if (Date.now() < this.redisUnavailableUntilMs) {
      this.failClosed(context, "Redis is temporarily unavailable");
    }

    try {
      await this.ensureRedisReady(redis);
    } catch (error) {
      this.markRedisUnavailable(context, error);
    }

    const keys = limitKey(context);
    const userLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `${WEB_CALLOUT_RATE_LIMIT_REDIS_KEY_PREFIX}:user`,
      points: WEB_CALLOUT_RATE_LIMIT_USER_POINTS,
      duration: WEB_CALLOUT_RATE_LIMIT_DURATION_SECONDS,
      rejectIfRedisNotReady: true,
    });
    const endpointLimiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `${WEB_CALLOUT_RATE_LIMIT_REDIS_KEY_PREFIX}:endpoint`,
      points: WEB_CALLOUT_RATE_LIMIT_ENDPOINT_POINTS,
      duration: WEB_CALLOUT_RATE_LIMIT_DURATION_SECONDS,
      rejectIfRedisNotReady: true,
    });

    await this.consumeLimiter(userLimiter, keys.user, context);
    await this.consumeLimiter(endpointLimiter, keys.endpoint, context);
  }

  private async ensureRedisReady(redis: Redis | Cluster) {
    if (redisStatus(redis) === "ready") {
      return;
    }

    this.redisConnectPromise ??= redis.connect().finally(() => {
      this.redisConnectPromise = null;
    });

    await this.redisConnectPromise;
  }

  private async consumeLimiter(
    limiter: RateLimiterRedis,
    key: string,
    context: WebCalloutLimitContext,
  ) {
    try {
      await limiter.consume(key);
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        recordWebCalloutInvokeMetric("rate_limited", context);
        throw tooManyRequests(
          "Web callout invocation rate limit exceeded.",
          getRetryAfterSeconds(error.msBeforeNext),
        );
      }

      this.markRedisUnavailable(context, error);
    }
  }

  private markRedisUnavailable(
    context: WebCalloutLimitContext,
    error: unknown,
  ): never {
    this.redisUnavailableUntilMs = Date.now() + REDIS_RETRY_COOLDOWN_MS;
    logger.warn("Web callout rate limiter unavailable", {
      orgId: context.orgId,
      projectId: context.projectId,
      endpointId: context.endpointId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    this.failClosed(context, "Redis is temporarily unavailable");
  }

  private failClosed(context: WebCalloutLimitContext, reason: string): never {
    recordWebCalloutInvokeMetric("rate_limit_unavailable", context);
    logger.warn("Web callout invocation blocked because rate limiting failed", {
      orgId: context.orgId,
      projectId: context.projectId,
      endpointId: context.endpointId,
      reason,
    });
    throw tooManyRequests("Web callout invocation is temporarily unavailable.");
  }
}

export const enforceWebCalloutRateLimit = async (
  context: WebCalloutLimitContext,
) => {
  await WebCalloutRateLimitService.getInstance().consume(context);
};

let activeWebCallouts = 0;
const activeWebCalloutsByEndpoint = new Map<string, number>();

export const resetWebCalloutInFlightLimitsForTests = () => {
  activeWebCallouts = 0;
  activeWebCalloutsByEndpoint.clear();
};

export const withWebCalloutInFlightLimit = async <T>(
  context: WebCalloutLimitContext,
  fn: () => Promise<T>,
): Promise<T> => {
  const endpointKey = limitKey(context).endpoint;
  const activeForEndpoint = activeWebCalloutsByEndpoint.get(endpointKey) ?? 0;

  if (
    activeWebCallouts >= WEB_CALLOUT_MAX_IN_FLIGHT_PER_PROCESS ||
    activeForEndpoint >= WEB_CALLOUT_MAX_IN_FLIGHT_PER_ENDPOINT
  ) {
    recordWebCalloutInvokeMetric("concurrency_rejected", context);
    throw tooManyRequests(
      "Too many web callouts are already in flight. Please retry shortly.",
    );
  }

  activeWebCallouts += 1;
  activeWebCalloutsByEndpoint.set(endpointKey, activeForEndpoint + 1);

  try {
    return await fn();
  } finally {
    activeWebCallouts -= 1;
    const nextActiveForEndpoint =
      (activeWebCalloutsByEndpoint.get(endpointKey) ?? 1) - 1;
    if (nextActiveForEndpoint <= 0) {
      activeWebCalloutsByEndpoint.delete(endpointKey);
    } else {
      activeWebCalloutsByEndpoint.set(endpointKey, nextActiveForEndpoint);
    }
  }
};
