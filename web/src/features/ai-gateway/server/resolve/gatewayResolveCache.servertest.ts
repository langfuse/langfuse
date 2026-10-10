import type { Redis } from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CachedResolveContext,
  GatewayResolveCache,
} from "./gatewayResolveCache";

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "true",
    LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_TTL_SECONDS: 300,
  },
}));

const context: CachedResolveContext = {
  organizationId: "org-1",
  apiKeyId: "key-1",
  keyMetadata: {},
  ingestionProjectId: null,
  ingestionMode: null,
  connection: null,
};

describe("GatewayResolveCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not cache a resolve context beyond the API key expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T15:00:00.000Z"));
    const redis = {
      set: vi.fn().mockResolvedValue("OK"),
      sadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as unknown as Redis;

    await new GatewayResolveCache(redis).set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
      expiresAt: new Date("2026-10-09T15:00:10.000Z"),
    });

    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "EX",
      10,
    );
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 600);
  });

  it("skips caching a context when the API key has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T15:00:00.000Z"));
    const redis = {
      set: vi.fn(),
      sadd: vi.fn(),
      expire: vi.fn(),
    } as unknown as Redis;

    await new GatewayResolveCache(redis).set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
      expiresAt: new Date("2026-10-09T14:59:59.000Z"),
    });

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.sadd).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });
});
