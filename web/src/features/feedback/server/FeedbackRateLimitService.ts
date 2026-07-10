import type { Cluster, Redis } from "ioredis";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { BaseError, ServiceUnavailableError } from "@langfuse/shared";
import {
  recordIncrement,
  redis as defaultRedis,
} from "@langfuse/shared/src/server";

import type { FeedbackSource } from "./FeedbackService";

export const FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX = "rate-limit:feedback";

type FeedbackRateLimitContext = {
  source: FeedbackSource;
  orgId?: string;
};

const createLimiter = (
  storeClient: Redis | Cluster,
  bucket: string,
  points: number,
  duration: number,
) =>
  new RateLimiterRedis({
    storeClient,
    keyPrefix: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:${bucket}`,
    points,
    duration,
    rejectIfRedisNotReady: true,
  });

export const enforceFeedbackRateLimit = async (
  context: FeedbackRateLimitContext,
  storeClient: Redis | Cluster | null = defaultRedis,
): Promise<void> => {
  if (!storeClient) {
    recordIncrement("langfuse.feedback.submission", 1, {
      source: context.source,
      outcome: "rate_limit_unavailable",
    });
    throw new ServiceUnavailableError("Feedback intake is unavailable");
  }

  const principalKey = context.orgId
    ? `org:${context.orgId}`
    : `source:${context.source}`;
  const principalDailyLimit = context.source === "langfuse-docs-mcp" ? 50 : 10;

  const limits = [
    {
      limiter: createLimiter(storeClient, "principal-minute", 5, 60),
      key: principalKey,
    },
    {
      limiter: createLimiter(
        storeClient,
        "principal-day",
        principalDailyLimit,
        86_400,
      ),
      key: principalKey,
    },
    {
      limiter: createLimiter(storeClient, "global-second", 1, 1),
      key: "feedback",
    },
    {
      limiter: createLimiter(storeClient, "global-day", 100, 86_400),
      key: "feedback",
    },
  ];

  try {
    for (const { limiter, key } of limits) {
      await limiter.consume(key);
    }
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      recordIncrement("langfuse.feedback.submission", 1, {
        source: context.source,
        outcome: "rate_limited",
      });
      throw new BaseError(
        "TooManyRequestsError",
        429,
        "Feedback rate limit exceeded",
        true,
      );
    }

    recordIncrement("langfuse.feedback.submission", 1, {
      source: context.source,
      outcome: "rate_limit_unavailable",
    });
    throw new ServiceUnavailableError("Feedback intake is unavailable");
  }
};
