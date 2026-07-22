import type { Cluster, Redis } from "ioredis";
import { BaseError, ServiceUnavailableError } from "@langfuse/shared";
import {
  recordIncrement,
  redis as defaultRedis,
} from "@langfuse/shared/src/server";

import type { FeedbackSource } from "./FeedbackService";

// The hash tag keeps every key in the same Redis Cluster slot so the Lua
// script can check and consume all quotas atomically.
export const FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX = "rate-limit:{feedback}";

type FeedbackRateLimitContext = {
  source: FeedbackSource;
  orgId?: string;
};

type FeedbackLimit = {
  key: string;
  points: number;
  durationSeconds: number;
};

const ATOMIC_RATE_LIMIT_LUA = `
for index, key in ipairs(KEYS) do
  local current = tonumber(redis.call("GET", key) or "0")
  local points = tonumber(ARGV[((index - 1) * 2) + 1])
  if current >= points then
    return 0
  end
end

for index, key in ipairs(KEYS) do
  local duration = tonumber(ARGV[((index - 1) * 2) + 2])
  local current = redis.call("INCR", key)
  if current == 1 then
    redis.call("EXPIRE", key, duration)
  end
end

return 1
`;

const getFeedbackLimits = (
  context: FeedbackRateLimitContext,
): FeedbackLimit[] => {
  const principalKey = context.orgId
    ? `org:${context.orgId}`
    : `source:${context.source}`;

  return [
    {
      key: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-minute:${principalKey}`,
      points: 5,
      durationSeconds: 60,
    },
    {
      key: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-day:${principalKey}`,
      points: 20,
      durationSeconds: 86_400,
    },
    {
      key: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-second`,
      points: 1,
      durationSeconds: 1,
    },
    {
      key: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-day`,
      points: 100,
      durationSeconds: 86_400,
    },
  ];
};

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

  const limits = getFeedbackLimits(context);

  try {
    const result = await storeClient.eval(
      ATOMIC_RATE_LIMIT_LUA,
      limits.length,
      ...limits.map(({ key }) => key),
      ...limits.flatMap(({ points, durationSeconds }) => [
        points,
        durationSeconds,
      ]),
    );

    if (result !== 1) {
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
  } catch (error) {
    if (error instanceof BaseError) throw error;

    recordIncrement("langfuse.feedback.submission", 1, {
      source: context.source,
      outcome: "rate_limit_unavailable",
    });
    throw new ServiceUnavailableError("Feedback intake is unavailable");
  }
};
