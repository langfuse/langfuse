import { type OrgEnrichedApiKey } from "@langfuse/shared/src/server";
import type Redis from "ioredis";
import { type z } from "zod";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from "rate-limiter-flexible";
import { env } from "@/src/env.mjs";

// business logic to consider
// - not all orgs have a cloud config. Need to default to hobby plan within
// - we have the oss plan which is used for self-hosters.
// - only apply rate-limits if cloud config is present
// - rate limits are per org. We pull the orgId and the plan into the API key stored in Redis to have fast rate limiting.
// - if Redis is not available, we apply container level memory rate limiting.

export type RateLimitResult = {
  apiKey: z.infer<typeof OrgEnrichedApiKey>;
  ressource: RateLimitRessource;
  points: number;

  // from rate-limiter-flexible
  remainingPoints: number;
  msBeforeNext: number;
  consumedPoints: number;
  isFirstInDuration: boolean;
};

export type RateLimitRessource =
  | "ingestion"
  | "public-api"
  | "public-api-metrics"
  | "prompts";

const rateLimitConfig = {
  default: {
    ingestion: { points: 10, duration: 60 },
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

export class RateLimitService {
  private redis: Redis | undefined;

  constructor(redis: Redis | undefined) {
    this.redis = redis;

    if (!redis) {
      console.error("RateLimitService: Redis is not available, using memory");
    }
  }

  async rateLimitRequest(
    apiKey: z.infer<typeof OrgEnrichedApiKey>,
    ressource: RateLimitRessource,
  ) {
    // if cloud config is not present, we don't apply rate limits
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return;
    }

    // no rate limit for oss users
    if (apiKey.plan === "oss") {
      return;
    }

    return await this.checkRateLimit(apiKey, ressource);
  }

  async checkRateLimit(
    apiKey: z.infer<typeof OrgEnrichedApiKey>,
    ressource: RateLimitRessource,
  ) {
    // first get the organisation for an API key
    // add this to the key in redis, so that

    // get the rate limit key
    const rateLimitKey = this.createRateLimitKey(apiKey);

    const config =
      rateLimitConfig[
        ["default", "cloud:hobby", "cloud:pro"].includes(apiKey.plan)
          ? "default"
          : (apiKey.plan as keyof typeof rateLimitConfig)
      ][ressource];

    if (!config) throw new Error("Rate limit not configured for this plan");

    const opts = {
      // Basic options
      points: config.points, // Number of points
      duration: config.duration, // Per second(s)

      keyPrefix: ressource.toString(), // must be unique for limiters with different purpose
    };

    const rateLimiter = this.redis
      ? new RateLimiterRedis({
          ...opts,
          storeClient: this.redis,
        })
      : new RateLimiterMemory(opts);

    let res: RateLimitResult | undefined = undefined;
    try {
      const libRes = await rateLimiter.consume(rateLimitKey);
      res = {
        apiKey,
        ressource,
        points: config.points,
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
          ressource,
          points: config.points,
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

  createRateLimitKey(apiKey: z.infer<typeof OrgEnrichedApiKey>) {
    return `rate-limit:${apiKey.orgId}`;
  }
}
