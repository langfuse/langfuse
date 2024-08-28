import type Redis from "ioredis";
import { type z } from "zod";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { env } from "@/src/env.mjs";
import {
  type RateLimitResult,
  type RateLimitResource,
  type RateLimitConfig,
  type Plan,
  type CloudConfigRateLimit,
} from "@langfuse/shared";
import {
  recordIncrement,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { type NextApiResponse } from "next";

// business logic to consider
// - not all orgs have a cloud config. Need to default to hobby plan within
// - we have the oss plan which is used for self-hosters.
// - only apply rate-limits if cloud config is present
// - rate limits are per org. We pull the orgId and the plan into the API key stored in Redis to have fast rate limiting.
// - if Redis is not available, we apply container level memory rate limiting.

const getRateLimitConfig = (
  plan: Plan,
  resource: z.infer<typeof RateLimitResource>,
): z.infer<typeof RateLimitConfig> => {
  let planConfig: z.infer<typeof CloudConfigRateLimit> = [];

  switch (plan) {
    case "oss":
      planConfig = [];
      break;
    case "cloud:hobby":
      planConfig = [
        { resource: "ingestion", points: 100, duration: 60 },
        { resource: "prompts", points: null, duration: null },
        { resource: "public-api", points: 1000, duration: 60 },
        { resource: "public-api-metrics", points: 10, duration: 60 },
      ];
      break;
    case "cloud:pro":
      planConfig = [
        { resource: "ingestion", points: 2000, duration: 60 },
        { resource: "prompts", points: null, duration: null },
        { resource: "public-api", points: 5000, duration: 60 },
        { resource: "public-api-metrics", points: 50, duration: 60 },
      ];
      break;
    case "cloud:team":
      planConfig = [
        { resource: "ingestion", points: 5000, duration: 60 },
        { resource: "prompts", points: null, duration: null },
        { resource: "public-api", points: 10000, duration: 60 },
        { resource: "public-api-metrics", points: 100, duration: 60 },
      ];
      break;
    case "self-hosted:enterprise":
      planConfig = [
        { resource: "ingestion", points: 10000, duration: 60 },
        { resource: "prompts", points: null, duration: null },
        { resource: "public-api", points: 20000, duration: 60 },
        { resource: "public-api-metrics", points: 200, duration: 60 },
      ];
      break;
    default:
      // typescript type error if we don't handle all plans in the switch
      const exhaustiveCheck: never = plan;
      throw new Error(`Unhandled plan case: ${exhaustiveCheck}`);
  }

  const config = planConfig.find((config) => config.resource === resource);

  if (!config) {
    throw new Error(
      `Rate limit config for resource ${resource} not found for plan ${plan}`,
    );
  }
  return config;
};

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
      return;
    }

    if (!this.redis) {
      console.log("Rate limiting not available without Redis");
      return;
    }

    return new RateLimitHelper(await this.checkRateLimit(scope, resource));
  }

  async checkRateLimit(
    scope: ApiAccessScope,
    resource: z.infer<typeof RateLimitResource>,
  ) {
    const planBasedConfig = getRateLimitConfig(scope.plan, resource);

    const customConfig = scope.rateLimits?.find(
      (config) => config.resource === resource,
    );

    const effectiveConfig = customConfig || planBasedConfig;

    // returning early if no rate limit is set
    if (
      !effectiveConfig ||
      !effectiveConfig.points ||
      !effectiveConfig.duration
    ) {
      return;
    }

    const rateLimiter = new RateLimiterRedis({
      // Basic options
      points: effectiveConfig.points, // Number of points
      duration: effectiveConfig.duration, // Per second(s)

      keyPrefix: this.rateLimitPrefix(resource), // must be unique for limiters with different purpose
      storeClient: this.redis,
    });

    console.log("Rate limiting for resource", resource, "with config");

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
        console.log("Internal Rate limit error", err);
        throw err;
      }
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
    console.log(
      "Rate limit result",
      this.res,
      "is rate limited",
      this.res?.remainingPoints,
    );
    return this.res ? this.res.remainingPoints < 1 : false;
  }

  sendRestResponseIfLimited(nextResponse: NextApiResponse) {
    if (!this.res || !this.isRateLimited()) {
      return;
    }
    return sendRateLimitResponse(nextResponse, this.res);
  }
}

export const sendRateLimitResponse = (
  res: NextApiResponse,
  rateLimitRes: RateLimitResult,
) => {
  recordIncrement("rate-limit-exceeded", 1, {
    orgId: rateLimitRes.scope.orgId,
    plan: rateLimitRes.scope.plan,
    resource: rateLimitRes.resource,
  });

  const httpHeader = createHttpHeaderFromRateLimit(rateLimitRes);

  for (const [header, value] of Object.entries(httpHeader)) {
    res.setHeader(header, value);
  }

  res.status(429).end();
};

const createHttpHeaderFromRateLimit = (res: RateLimitResult) => {
  return {
    "Retry-After": res.msBeforeNext / 1000,
    "X-RateLimit-Limit": res.points,
    "X-RateLimit-Remaining": res.remainingPoints,
    "X-RateLimit-Reset": new Date(Date.now() + res.msBeforeNext).toString(),
  };
};
