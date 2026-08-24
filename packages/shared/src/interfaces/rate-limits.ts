import z from "zod";
import { ApiAccessScope } from "../server";

export const RateLimitResource = z.enum([
  "ingestion",
  "media-upload",
  "public-api",
  "public-api-legacy",
  "public-api-metrics",
  "public-api-v2-metrics",
  "public-api-daily-metrics-legacy",
  "prompts",
  "legacy-ingestion",
  "datasets",
  "annotation-queues",
  "trace-delete",
  "score-delete",
  "in-app-agent-run",
  "feedback",
]);

/** RateLimitScope is the slice of the access scope rate limiting reads: the org key, its plan, and any per-org overrides. */
export type RateLimitScope = Pick<
  ApiAccessScope,
  "orgId" | "plan" | "rateLimitOverrides"
>;

// result of the rate limit check.
export type RateLimitResult = {
  resource: z.infer<typeof RateLimitResource>;
  points: number;
  scope: RateLimitScope;

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
