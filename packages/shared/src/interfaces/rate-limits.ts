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

export const RateLimitValue = z.object({
  points: z.number(),
  duration: z.number(),
});

export const RateLimitConfig = z.record(
  RateLimitResource,
  RateLimitValue.nullable()
);

export const RateLimitConfigZod = z.record(z.string(), RateLimitConfig);

export type RateLimitConfig = z.infer<typeof RateLimitConfigZod>;
