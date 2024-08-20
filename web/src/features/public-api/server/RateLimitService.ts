import { type ApiKeyZod } from "@langfuse/shared/src/server";
import type Redis from "ioredis";
import { type z } from "zod";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { type NextApiResponse } from "next";

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

export type RateLimitResponse = {
  res: RateLimiterRes;
  opts: {
    points: number;
    duration: number;
    keyPrefix: string;
  };
};

export class RateLimitService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async rateLimitRequest(
    apiKey: z.infer<typeof ApiKeyZod>,
    ressource: RateLimitRessource,
  ) {
    // no rate limit for oss users
    if (apiKey.plan === "oss") {
      return;
    }

    return await this.checkRateLimit(apiKey, ressource);
  }

  async checkRateLimit(
    apiKey: z.infer<typeof ApiKeyZod>,
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
      storeClient: this.redis,
      points: config.points, // Number of points
      duration: config.duration, // Per second(s)

      keyPrefix: ressource.toString(), // must be unique for limiters with different purpose
    };

    const rateLimiterRedis = new RateLimiterRedis(opts);

    let res = undefined;
    try {
      res = await rateLimiterRedis.consume(rateLimitKey);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        // No points available or key is blocked
        res = err;
      } else {
        // Some other error occurred, rethrow it
        console.log("Internal Rate limit error", err);
        throw err;
      }
    }

    return { res, opts };
  }

  createRateLimitKey(apiKey: z.infer<typeof ApiKeyZod>) {
    return `rate-limit:${apiKey.orgId}`;
  }
}
