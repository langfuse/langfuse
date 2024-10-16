import type Redis from "ioredis";
import { type z } from "zod";
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
} from "@langfuse/shared/src/server";
import { type NextApiResponse } from "next";

// Business Logic
// - rate limit strategy is based on org-id, org plan, and resources. Rate limits are applied in buckets of minutes.
// - rate limits are not applied for self hosters and are also not applied when Redis is not available
// - infos for rate-limits are taken from the API access scope. Info for this scope is stored alongside API Keys in Redis for efficient access.
// - isRateLimited returns false for self-hosters
// - sendRestResponseIfLimited sends a 429 response with headers if the rate limit is exceeded. Return this from the route handler.
export class RateLimitService {
  private redis: Redis | null;

  constructor(redis: Redis | null) {
    this.redis = redis;
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

    if (!this.redis) {
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

    const rateLimiter = new RateLimiterRedis({
      // Basic options
      points: effectiveConfig.points, // Number of points
      duration: effectiveConfig.durationInSec, // Per second(s)

      keyPrefix: this.rateLimitPrefix(resource), // must be unique for limiters with different purpose
      storeClient: this.redis,
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
        // Some other error occurred, rethrow it
        logger.error("Internal Rate limit error", err);
        throw err;
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

const createHttpHeaderFromRateLimit = (res: RateLimitResult) => {
  return {
    "Retry-After": res.msBeforeNext / 1000,
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
    case "self-hosted:enterprise":
      return {
        resource,
        points: null,
        durationInSec: null,
      };
    case "cloud:hobby":
    case "cloud:pro":
      switch (resource) {
        case "ingestion":
          return {
            resource: "ingestion",
            points: 1000,
            durationInSec: 60,
          };
        case "legacy-ingestion":
          return {
            resource: "prompts",
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
        case "public-api-metrics":
          return {
            resource: "public-api-metrics",
            points: 10,
            durationInSec: 60,
          };
        default:
          const exhaustiveCheckDefault: never = resource;
          throw new Error(`Unhandled resource case: ${exhaustiveCheckDefault}`);
      }
    case "cloud:team":
      switch (resource) {
        case "ingestion":
          return {
            resource: "ingestion",
            points: 5000,
            durationInSec: 60,
          };
        case "legacy-ingestion":
          return {
            resource: "prompts",
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
        case "public-api-metrics":
          return {
            resource: "public-api-metrics",
            points: 10,
            durationInSec: 60,
          };
        default:
          const exhaustiveCheckTeam: never = resource;
          throw new Error(`Unhandled resource case: ${exhaustiveCheckTeam}`);
      }
    default:
      const exhaustiveCheck: never = plan;
      throw new Error(`Unhandled plan case: ${exhaustiveCheck}`);
  }
};
