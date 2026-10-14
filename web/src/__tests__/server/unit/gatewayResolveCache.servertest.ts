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
  keyMetadata: {},
  ingestionProjectId: null,
  ingestionMode: null,
  connections: [],
};

function createStatefulRedis(onGet?: (key: string) => Promise<void>): Redis {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    get: vi.fn(async (key: string) => {
      await onGet?.(key);
      return values.get(key) ?? null;
    }),
    set: vi.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve("OK");
    }),
    incr: vi.fn((key: string) => {
      const next = Number(values.get(key) ?? "0") + 1;
      values.set(key, String(next));
      return Promise.resolve(next);
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
      mutationGeneration: 0,
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
      mutationGeneration: 0,
    });

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.sadd).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("does not repopulate stale context after organization invalidation", async () => {
    const cache = new GatewayResolveCache(createStatefulRedis());
    const mutationGeneration = await cache.getMutationGeneration();

    await cache.invalidateOrganization(context.organizationId);
    await cache.set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
      mutationGeneration,
    });

    await expect(
      cache.get({
        fastHashedSecretKey: "hashed-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toBeNull();
  });

  it("does not repopulate stale context after API key invalidation", async () => {
    const cache = new GatewayResolveCache(createStatefulRedis());
    const mutationGeneration = await cache.getMutationGeneration();

    await cache.invalidateApiKey("hashed-key");
    await cache.set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
      mutationGeneration,
    });

    await expect(
      cache.get({
        fastHashedSecretKey: "hashed-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toBeNull();
  });

  it("fences invalidation that starts while a stale context is being cached", async () => {
    let cache: GatewayResolveCache;
    let invalidated = false;
    const redis = createStatefulRedis(async (key) => {
      if (
        !invalidated &&
        key.includes(`:org:${context.organizationId}:`) &&
        key.endsWith(":generation")
      ) {
        invalidated = true;
        await cache.invalidateOrganization(context.organizationId);
      }
    });
    cache = new GatewayResolveCache(redis);
    const mutationGeneration = await cache.getMutationGeneration();

    await cache.set({
      fastHashedSecretKey: "hashed-key",
      apiFormat: "openai.responses",
      context,
      mutationGeneration,
    });

    await expect(
      cache.get({
        fastHashedSecretKey: "hashed-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toBeNull();
  });
});
