import type { Redis } from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CachedResolveContext,
  GatewayResolveCache,
} from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "true",
    LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_TTL_SECONDS: 300,
  },
}));

const context: CachedResolveContext = {
  organizationId: "org-1",
  apiKeyId: "key-1",
  userId: "user-1",
  apiKeyName: "CI key",
  userName: "Alice",
  keyMetadata: {},
  ingestionProjectId: null,
  ingestionMode: null,
  connections: [],
};

function createStatefulRedis(): Redis {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve("OK");
    }),
    sadd: vi.fn((key: string, value: string) => {
      const entries = sets.get(key) ?? new Set<string>();
      entries.add(value);
      sets.set(key, entries);
      return Promise.resolve(1);
    }),
    smembers: vi.fn((key: string) =>
      Promise.resolve([...(sets.get(key) ?? new Set<string>())]),
    ),
    expire: vi.fn().mockResolvedValue(1),
    del: vi.fn((...keys: string[]) => {
      keys.forEach((key) => {
        values.delete(key);
        sets.delete(key);
      });
      return Promise.resolve(keys.length);
    }),
  } as unknown as Redis;
}

describe("GatewayResolveCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not cache a resolve context beyond the API key expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T15:00:00.000Z"));
    const redis = {
      get: vi.fn().mockResolvedValue(null),
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
      "PXAT",
      new Date("2026-10-09T15:00:10.000Z").getTime(),
    );
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 600);
  });

  it("skips caching a context when the API key has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T15:00:00.000Z"));
    const redis = {
      get: vi.fn().mockResolvedValue(null),
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

  it("reads entries cached before the key snapshot fields existed", async () => {
    const redis = createStatefulRedis();
    const cache = new GatewayResolveCache(redis);
    const legacy = {
      organizationId: "org-1",
      apiKeyId: "key-1",
      userId: "user-1",
      keyMetadata: {},
      ingestionProjectId: null,
      ingestionMode: null,
      connections: [],
    };
    await cache.set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context: legacy as unknown as CachedResolveContext,
    });

    await expect(
      cache.get({
        fastHashedSecretKey: "hashed-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toEqual({
      ...legacy,
      apiKeyName: null,
      userName: null,
    });
  });

  it("invalidates cached contexts for an organization", async () => {
    const cache = new GatewayResolveCache(createStatefulRedis());

    await cache.set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
    });
    await cache.invalidateOrganization(context.organizationId);

    await expect(
      cache.get({
        fastHashedSecretKey: "hashed-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toBeNull();
  });

  it("invalidates cached contexts for an API key", async () => {
    const cache = new GatewayResolveCache(createStatefulRedis());

    await cache.set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
    });
    await cache.invalidateApiKey("hashed-key");

    await expect(
      cache.get({
        fastHashedSecretKey: "hashed-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toBeNull();
  });
});
