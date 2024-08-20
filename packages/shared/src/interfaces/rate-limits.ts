import z from "zod";
import { OrgEnrichedApiKey } from "../server";

export type RateLimitResult = {
  apiKey: z.infer<typeof OrgEnrichedApiKey>;
  resource: z.infer<typeof RateLimitResource>;
  points: number;

  // from rate-limiter-flexible
  remainingPoints: number;
  msBeforeNext: number;
  consumedPoints: number;
  isFirstInDuration: boolean;
};

export const RateLimitResource = z.enum([
  "ingestion",
  "public-api",
  "public-api-metrics",
  "prompts",
]);

export const RateLimitConfig = z.object({
  points: z.number().nullish(),
  duration: z.number().nullish(),
  resource: RateLimitResource,
});

export const CloudConfigRateLimitZod = z.array(RateLimitConfig);

export const RateLimitPlanConfig = z.object({
  default: z.array(RateLimitConfig),
  team: z.array(RateLimitConfig),
});
