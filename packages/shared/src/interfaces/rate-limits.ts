import z from "zod";
import { ApiAccessScope } from "../server";

export const RateLimitResource = z.enum([
  "ingestion",
  "public-api",
  "public-api-metrics",
  "prompts",
  "legacy-ingestion",
]);

// result of the rate limit check.
export type RateLimitResult = {
  resource: z.infer<typeof RateLimitResource>;
  points: number;
  scope: ApiAccessScope;

  // from rate-limiter-flexible
  remainingPoints: number;
  msBeforeNext: number;
  consumedPoints: number;
  isFirstInDuration: boolean;
};

export const RateLimitConfig = z.object({
  points: z.number().nullish(),
  durationInSec: z.number().nullish(),
  resource: RateLimitResource,
});

export const CloudConfigRateLimit = z.array(RateLimitConfig);
