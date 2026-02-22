import { type Redis, type Cluster } from "ioredis";
import { type z } from "zod/v4";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { env } from "@/src/env.mjs";
import {
  type RateLimitResult,
  type RateLimitResource,
  type RateLimitConfig,
  type Plan,
} from "@langfuse/shared";
import {
  recordIncrement,
  type ApiAccessScope,
  logger,
  createNewRedisInstance,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";
import { type NextApiResponse } from "next";

// Business Logic
// - rate limit strategy is based on org-id, org plan, and resources. Rate limits are applied in buckets of minutes.
// - rate limits are not applied for self hosters and are also not applied when Redis is not available
// - infos for rate-limits are taken from the API access scope. Info for this scope is stored alongside API Keys in Redis for efficient access.
// - isRateLimited returns false for self-hosters
// - sendRestResponseIfLimited sends a 429 response with headers if the rate limit is exceeded. Return this from the route handler.
export class RateLimitService {
  private static redis: Redis | Cluster | null;
  private static instance: RateLimitService | null = null;

  public static getInstance(redis: Redis | null = null) {
    if (!RateLimitService.instance) {
      RateLimitService.redis =
        redis ??
        createNewRedisInstance({
          enableAutoPipelining: false, // This may help avoid https://github.com/redis/ioredis/issues/1931
          enableOfflineQueue: false,
          lazyConnect: true, // Connect when first command is sent
          ...redisQueueRetryOptions,
        });
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  public static shutdown() {
    if (RateLimitService.redis && RateLimitService.redis.status !== "end") {
      RateLimitService.redis.disconnect();
    }
    RateLimitService.redis = null;
    RateLimitService.instance = null;
  }

  async rateLimitRequest(
    scope: ApiAccessScope,
    resource: z.infer<typeof RateLimitResource>,
  ) {
    // if cloud config is not present, we don't apply rate limits and just return
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return new RateLimitHelper(undefined);
    }

    if (env.LANGFUSE_RATE_LIMITS_ENABLED === "false") {
      return new RateLimitHelper(undefined);
    }

    if (!RateLimitService.redis) {
      logger.warn("Rate limiting not available without Redis");
      return new RateLimitHelper(undefined);
    }

    return new RateLimitHelper(await this.checkRateLimit(scope, resource));
  }

  async checkRateLimit(
    scope: ApiAccessScope,
    resource: z.infer<typeof RateLimitResource>,
  ) {
    const effectiveConfig = getRateLimitConfig(scope, resource);

    // returning early if no rate limit is set
    if (
      !effectiveConfig ||
      !effectiveConfig.points ||
      !effectiveConfig.durationInSec
    ) {
      return;
    }

    // Connect Redis if not initialized
    if (RateLimitService?.redis?.status !== "ready") {
      try {
        await RateLimitService?.redis?.connect();
      } catch (_err) {
        // Do nothing here. We will fail open if Redis is not available.
      }
    }

    const rateLimiter = new RateLimiterRedis({
      // Basic options
      points: effectiveConfig.points, // Number of points
      duration: effectiveConfig.durationInSec, // Per second(s)

      keyPrefix: this.rateLimitPrefix(resource), // must be unique for limiters with different purpose
      storeClient: RateLimitService.redis,
      rejectIfRedisNotReady: true,
    });

    let res: RateLimitResult | undefined = undefined;
    try {
      // orgId used as key for different resources
      const libRes = await rateLimiter.consume(scope.orgId);
      res = {
        resource,
        scope,
        points: effectiveConfig.points,
        remainingPoints: libRes.remainingPoints,
        msBeforeNext: libRes.msBeforeNext,
        consumedPoints: libRes.consumedPoints,
        isFirstInDuration: libRes.isFirstInDuration,
      };
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        // No points available or key is blocked
        res = {
          resource,
          scope,
          points: effectiveConfig.points,
          remainingPoints: err.remainingPoints,
          msBeforeNext: err.msBeforeNext,
          consumedPoints: err.consumedPoints,
          isFirstInDuration: err.isFirstInDuration,
        };
      } else {
        // Some other error occurred, return undefined to fail open
        logger.error("Internal Rate limit error", err);
        return undefined;
      }
    }

    if (res.remainingPoints < 1) {
      recordIncrement("langfuse.rate_limit.exceeded", 1, {
        orgId: scope.orgId,
        plan: scope.plan,
        resource: resource,
      });
    }

    return res;
  }

  rateLimitPrefix(resource: string) {
    return `rate-limit:${resource}`;
  }
}

export class RateLimitHelper {
  res: RateLimitResult | undefined;

  constructor(res: RateLimitResult | undefined) {
    this.res = res;
  }

  isRateLimited() {
    return this.res ? this.res.remainingPoints < 1 : false;
  }

  sendRestResponseIfLimited(nextResponse: NextApiResponse) {
    if (!this.res || !this.isRateLimited()) {
      logger.error("Trying to send rate limit response without being limited.");
      throw new Error(
        "Trying to send rate limit response without being limited.",
      );
    }
    return sendRateLimitResponse(nextResponse, this.res);
  }
}

export const sendRateLimitResponse = (
  res: NextApiResponse,
  rateLimitRes: RateLimitResult,
) => {
  const httpHeader = createHttpHeaderFromRateLimit(rateLimitRes);

  for (const [header, value] of Object.entries(httpHeader)) {
    res.setHeader(header, value);
  }

  res.status(429).end("429 - rate limit exceeded");
};

export const createHttpHeaderFromRateLimit = (res: RateLimitResult) => {
  return {
    "Retry-After": Math.ceil(res.msBeforeNext / 1000),
    "X-RateLimit-Limit": res.points,
    "X-RateLimit-Remaining": res.remainingPoints,
    "X-RateLimit-Reset": new Date(Date.now() + res.msBeforeNext).toString(),
  };
};

const getRateLimitConfig = (
  scope: ApiAccessScope,
  resource: z.infer<typeof RateLimitResource>,
) => {
  const planBasedConfig = getPlanBasedRateLimitConfig(scope.plan, resource);
  const customConfig = scope.rateLimitOverrides?.find(
    (config) => config.resource === resource,
  );

  return customConfig || planBasedConfig;
};

const getPlanBasedRateLimitConfig = (
  plan: Plan,
  resource: z.infer<typeof RateLimitResource>,
): z.infer<typeof RateLimitConfig> => {
  switch (plan) {
    case "oss":
    case "self-hosted:pro":
    case "self-hosted:enterprise":
      return {
        resource,
        points: null,
        durationInSec: null,
      };
    case "cloud:hobby":
      switch (resource) {
        case "ingestion":
          return {
            resource: "ingestion",
            points: 1000,
            durationInSec: 60,
          };
        case "legacy-ingestion":
          return {
            resource: "legacy-ingestion",
            points: 100,
            durationInSec: 60,
          };
        case "prompts":
          return {
            resource: "prompts",
            points: null,
            durationInSec: null,
          };
        case "public-api":
          return {
            resource: "public-api",
            points: 30,
            durationInSec: 60,
          };
        case "datasets":
          return {
            resource: "datasets",
            points: 100,
            durationInSec: 60,
          };
        case "public-api-metrics":
          return {
            resource: "public-api-metrics",
            points: 100,
            durationInSec: 86400, // 100 requests per day
          };
        case "public-api-daily-metrics-legacy":
          return {
            resource: "public-api-daily-metrics-legacy",
            points: 10,
            durationInSec: 86400, // 10 requests per day
          };
        case "trace-delete":
          return {
            resource: "trace-delete",
            points: 50,
            durationInSec: 86400, // 50 requests per day
          };
        default:
          const exhaustiveCheck: never = resource;
          throw new Error(`Unhandled resource case: ${exhaustiveCheck}`);
      }
    case "cloud:core":
      // TEMPORARY: Expanded core plan rate limits to pro limits to enable legacy pro -> core migration
      // Original core limits (commented out):
      // ingestion: 4000, public-api: 100, datasets: 200, public-api-metrics: 200, public-api-daily-metrics-legacy: 20
      switch (resource) {
        case "ingestion":
          return {
            resource: "ingestion",
            // points: 4000, // original core limit
            points: 20_000, // temporary: using pro limit
            durationInSec: 60,
          };
        case "legacy-ingestion":
          return {
            resource: "legacy-ingestion",
            points: 400,
            durationInSec: 60,
          };
        case "prompts":
          return {
            resource: "prompts",
            points: null,
            durationInSec: null,
          };
        case "public-api":
          return {
            resource: "public-api",
            // points: 100, // original core limit
            points: 1000, // temporary: using pro limit
            durationInSec: 60,
          };
        case "datasets":
          return {
            resource: "datasets",
            // points: 200, // original core limit
            points: 1000, // temporary: using pro limit
            durationInSec: 60,
          };
        case "public-api-metrics":
          return {
            resource: "public-api-metrics",
            // points: 200, // original core limit
            points: 2000, // temporary: using pro limit
            durationInSec: 86400, // 2000 requests per day
          };
        case "public-api-daily-metrics-legacy":
          return {
            resource: "public-api-daily-metrics-legacy",
            // points: 20, // original core limit
            points: 200, // temporary: using pro limit
            durationInSec: 86400, // 200 requests per day
          };
        case "trace-delete":
          return {
            resource: "trace-delete",
            points: 200,
            durationInSec: 86400, // 200 requests per day
          };
        default:
          const exhaustiveCheck: never = resource;
          throw new Error(`Unhandled resource case: ${exhaustiveCheck}`);
      }
    case "cloud:pro":
    case "cloud:team":
    case "cloud:enterprise":
      switch (resource) {
        case "ingestion":
          return {
            resource: "ingestion",
            points: 20_000,
            durationInSec: 60,
          };
        case "legacy-ingestion":
          return {
            resource: "legacy-ingestion",
            points: 400,
            durationInSec: 60,
          };
        case "prompts":
          return {
            resource: "prompts",
            points: null,
            durationInSec: null,
          };
        case "public-api":
          return {
            resource: "public-api",
            points: 1000,
            durationInSec: 60,
          };
        case "datasets":
          return {
            resource: "datasets",
            points: 1000,
            durationInSec: 60,
          };
        case "public-api-metrics":
          return {
            resource: "public-api-metrics",
            points: 2000,
            durationInSec: 86400, // 2000 requests per day
          };
        case "public-api-daily-metrics-legacy":
          return {
            resource: "public-api-daily-metrics-legacy",
            points: 200,
            durationInSec: 86400, // 200 requests per day
          };
        case "trace-delete":
          return {
            resource: "trace-delete",
            points: 1000,
            durationInSec: 86400, // 1000 requests per day
          };
        default:
          const exhaustiveCheck: never = resource;
          throw new Error(`Unhandled resource case: ${exhaustiveCheck}`);
      }
    default:
      const exhaustiveCheck: never = plan;
      throw new Error(`Unhandled plan case: ${exhaustiveCheck}`);
  }
};
