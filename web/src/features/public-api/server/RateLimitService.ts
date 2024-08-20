import { type OrgEnrichedApiKey } from "@langfuse/shared/src/server";
import type Redis from "ioredis";
import { type z } from "zod";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { env } from "@/src/env.mjs";
import {
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitResource,
} from "@langfuse/shared";

// business logic to consider
// - not all orgs have a cloud config. Need to default to hobby plan within
// - we have the oss plan which is used for self-hosters.
// - only apply rate-limits if cloud config is present
// - rate limits are per org. We pull the orgId and the plan into the API key stored in Redis to have fast rate limiting.
// - if Redis is not available, we apply container level memory rate limiting.

const rateLimitConfig: RateLimitConfig = {
  default: {
    ingestion: { points: 100, duration: 60 },
    prompts: null,
    "public-api": { points: 1000, duration: 60 },
    "public-api-metrics": { points: 10, duration: 60 },
  },
  team: {
    ingestion: { points: 5000, duration: 60 },
    prompts: null,
    "public-api": { points: 1000, duration: 60 },
    "public-api-metrics": { points: 10, duration: 60 },
  },
};

const planGroups = {
  default: "default",
  "cloud:hobby": "default",
  "cloud:pro": "default",
  "cloud:team": "team",
  "self-hosted:enterprise": "team",
} as const;

export class RateLimitService {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: RateLimitConfig = rateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  async rateLimitRequest(
    apiKey: z.infer<typeof OrgEnrichedApiKey>,
    resource: z.infer<typeof RateLimitResource>,
  ) {
    // if cloud config is not present, we don't apply rate limits and just return
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return;
    }

    return await this.checkRateLimit(apiKey, resource);
  }

  async checkRateLimit(
    apiKey: z.infer<typeof OrgEnrichedApiKey>,
    resource: z.infer<typeof RateLimitResource>,
  ) {
    const planKey = planGroups[apiKey.plan as keyof typeof planGroups];

    if (!planKey) {
      throw new Error(`Plan ${apiKey.plan} not found`);
    }

    const planConfig = this.config[planKey];

    if (!planConfig || !(resource in planConfig)) {
      throw new Error(
        `Rate limit config for resource ${resource} not found for plan ${apiKey.plan}`,
      );
    }

    const planBasedConfig = planConfig[resource];

    const customConfig = apiKey.rateLimits?.find((config) =>
      config.hasOwnProperty(resource),
    );
    const hasCustomConfig = customConfig !== undefined;

    // If customConfig is explicitly set to null, it should prevail
    const effectiveConfig = hasCustomConfig
      ? customConfig?.[resource]
      : planBasedConfig;

    console.log("Api key", apiKey, "Resource", resource);
    console.log("Custom config", customConfig);
    console.log("Effective rate limit config", effectiveConfig);
    // returning early if no rate limit is set
    if (!effectiveConfig) {
      return;
    }

    const opts = {
      // Basic options
      points: effectiveConfig.points, // Number of points
      duration: effectiveConfig.duration, // Per second(s)

      keyPrefix: this.rateLimitPrefix(resource), // must be unique for limiters with different purpose
      storeClient: this.redis,
    };

    const rateLimiter = new RateLimiterRedis(opts);

    let res: RateLimitResult | undefined = undefined;
    try {
      // orgId used as key for different resources
      const libRes = await rateLimiter.consume(apiKey.orgId);
      res = {
        apiKey,
        resource,
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
          apiKey,
          resource,
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
