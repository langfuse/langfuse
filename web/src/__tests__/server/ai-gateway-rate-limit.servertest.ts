import { randomUUID } from "crypto";
import type { Redis } from "ioredis";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { logger } from "@langfuse/shared/src/server";

import {
  clearRedisKeysByPatternSafely,
  createRedisTestClient,
  ensureRedisReady,
  type RedisTestClient,
} from "@/src/__tests__/server/redis-test-utils";
import {
  type GatewayApiKeyAuthContext,
  GatewayApiKeyAuthenticator,
} from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import {
  enforceGatewayRateLimits,
  GatewayRateLimitError,
} from "@/src/features/ai-gateway/server/resolve/gatewayRateLimit";
import { gatewayResolveApiHandler } from "@/src/features/ai-gateway/server/resolve/gatewayResolveApiHandler";
import {
  RATE_LIMIT_REDIS_KEY_PREFIX,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";

const MiB = 1024 * 1024;

describe("AI Gateway organization rate limits", () => {
  let redis: RedisTestClient;
  let organizationId: string;

  const contextFor = (
    overrides: Partial<GatewayApiKeyAuthContext> = {},
  ): GatewayApiKeyAuthContext => ({
    organizationId,
    apiKeyId: "gateway-key-1",
    userId: null,
    apiKeyName: null,
    userName: null,
    userEmail: null,
    keyMetadata: {},
    ingestionProjectId: "project-1",
    ingestionMode: "USAGE",
    plan: "cloud:hobby",
    rateLimitOverrides: [],
    connection: null,
    providerModel: null,
    ...overrides,
  });

  const rejection = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(GatewayRateLimitError);
    return error as GatewayRateLimitError;
  };

  beforeAll(async () => {
    RateLimitService.shutdown();
    redis = createRedisTestClient({
      maxRetriesPerRequest: null,
      enableAutoPipelining: false,
    });
    await ensureRedisReady(redis);
    RateLimitService.getInstance(redis as Redis);
  }, 20_000);

  beforeEach(() => {
    organizationId = `ai-gateway-rate-limit-org-${randomUUID()}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearRedisKeysByPatternSafely(
      redis,
      `${RATE_LIMIT_REDIS_KEY_PREFIX}:*:${organizationId}`,
    );
  }, 20_000);

  afterAll(() => {
    redis.disconnect();
    RateLimitService.shutdown();
  });

  it("admits the plan's requests per minute and rejects the next one with a Langfuse message", async () => {
    const warn = vi.spyOn(logger, "warn");
    const context = contextFor();
    for (let i = 0; i < 100; i++) {
      await enforceGatewayRateLimits({ context, requestBytes: 10 });
    }

    const error = await rejection(
      enforceGatewayRateLimits({ context, requestBytes: 10 }),
    );

    expect(error.status).toBe(429);
    expect(error.code).toBe("rate_limit_exceeded");
    expect(error.limit).toBe("requests");
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(error.message).toBe(
      `Langfuse AI Gateway rate limit exceeded: your organization's Hobby plan allows 100 requests per minute. Retry after ${error.retryAfterSeconds}s or upgrade your plan.`,
    );
    expect(warn).toHaveBeenCalledWith("AI Gateway rate limit exceeded", {
      orgId: organizationId,
      projectId: "project-1",
      apiKeyId: "gateway-key-1",
      plan: "cloud:hobby",
      limit: "requests",
      current: 101,
      limitValue: 100,
      requestBytes: 10,
      retryAfterSeconds: error.retryAfterSeconds,
    });
  });

  it("counts request bodies toward the per-minute bytes limit", async () => {
    const context = contextFor({ plan: "cloud:core" });
    await enforceGatewayRateLimits({ context, requestBytes: 256 * MiB });

    const error = await rejection(
      enforceGatewayRateLimits({ context, requestBytes: 1 }),
    );

    expect(error.limit).toBe("bytes");
    expect(error.message).toBe(
      `Langfuse AI Gateway rate limit exceeded: your organization's Core plan allows 256 MiB of request bodies per minute. Retry after ${error.retryAfterSeconds}s or upgrade your plan.`,
    );
  });

  it("names a custom limit, its window, and support when the organization has an override", async () => {
    const context = contextFor({
      plan: "cloud:enterprise",
      rateLimitOverrides: [
        { resource: "ai-gateway-requests", points: 2, durationInSec: 3600 },
      ],
    });
    await enforceGatewayRateLimits({ context, requestBytes: 0 });
    await enforceGatewayRateLimits({ context, requestBytes: 0 });

    const error = await rejection(
      enforceGatewayRateLimits({ context, requestBytes: 0 }),
    );

    expect(error.message).toBe(
      `Langfuse AI Gateway rate limit exceeded: your organization's custom limit allows 2 requests per hour. Retry after ${error.retryAfterSeconds}s or contact Langfuse support to raise the limit.`,
    );
  });

  it("never limits self-hosted plans", async () => {
    const context = contextFor({ plan: "oss" });

    await expect(
      enforceGatewayRateLimits({ context, requestBytes: 1024 * MiB }),
    ).resolves.toBeUndefined();
  });

  it("answers /resolve with a 429 the gateway can map to a provider-native error", async () => {
    vi.spyOn(
      GatewayApiKeyAuthenticator.prototype,
      "authenticateRequest",
    ).mockResolvedValue(contextFor());
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
    });

    await gatewayResolveApiHandler({
      req,
      res,
      fastHashedSecretKey: "hashed-secret-key",
      apiFormat: "openai.responses",
      model: "gpt-4o-mini",
      requestBytes: 64 * MiB + 1,
    });

    expect(res.statusCode).toBe(429);
    const retryAfter = Number(res.getHeader("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(res.getHeader("langfuse-gateway-error-code")).toBe(
      "rate_limit_exceeded",
    );
    expect(res._getJSONData()).toEqual({
      error: `Langfuse AI Gateway rate limit exceeded: your organization's Hobby plan allows 64 MiB of request bodies per minute. Retry after ${retryAfter}s or upgrade your plan.`,
      limit: "bytes",
      organizationId,
    });
  });
});
