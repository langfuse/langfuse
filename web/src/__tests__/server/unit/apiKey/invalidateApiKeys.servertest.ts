import { type Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import { type ApiKey } from "@langfuse/shared/src/db";
import {
  API_KEY_CACHE_KEY_PREFIX,
  apiKeyCacheInvalidated,
  AUTHZ_CONTEXT_CACHE_KEY_PREFIX,
  createShaHash,
  createAuthzContextCacheKey,
  invalidateCachedApiKeys,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";

const apiKey = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_p",
  createdAt: new Date(0),
  note: null,
  publicKey: "pk-lf-1",
  hashedSecretKey: "hsk",
  fastHashedSecretKey: "fh1",
  displaySecretKey: "sk-...abc",
  lastUsedAt: null,
  expiresAt: null,
  isInAppAgentKey: false,
  projectId: "prj_1",
  orgId: "org_1",
  scope: "PROJECT",
  createdByUserId: "user_1",
  createdByApiKeyId: null,
  userId: null,
  ...over,
});

/** markerSpy captures the keys overwritten with the invalidated marker */
function markerSpy() {
  const set = vi.fn((_key: string, _value: string): Promise<"OK"> =>
    Promise.resolve("OK"),
  );
  const redis = { set } as unknown as Redis;
  const invalidatedKeys = () =>
    set.mock.calls
      .filter(([, value]) => value === JSON.stringify(apiKeyCacheInvalidated))
      .map(([key]) => key);
  return { redis, invalidatedKeys };
}

describe("invalidateCachedApiKeys clears both cache namespaces", () => {
  it("invalidates the legacy key plus both authz:context presentations per row", async () => {
    const { redis, invalidatedKeys } = markerSpy();
    const key = apiKey({ fastHashedSecretKey: "fh1", publicKey: "pk-lf-1" });

    await invalidateCachedApiKeys([key], "test", redis);

    const keys = invalidatedKeys();
    expect(keys).toContain(`${API_KEY_CACHE_KEY_PREFIX}fh1`);
    expect(keys).toContain(`${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}fh1`);
    expect(keys).toContain(createAuthzContextCacheKey("basic", "fh1"));
    expect(keys).toContain(createAuthzContextCacheKey("bearer", "fh1"));
    expect(keys).toContain(
      createAuthzContextCacheKey("bearer", createShaHash("pk-lf-1", env.SALT!)),
    );
    expect(keys).toContain(
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${createShaHash("pk-lf-1", env.SALT!)}`,
    );
  });

  it("covers a public-key-only row that never got a fast hash", async () => {
    const { redis, invalidatedKeys } = markerSpy();
    const key = apiKey({ fastHashedSecretKey: null, publicKey: "pk-lf-2" });

    await invalidateCachedApiKeys([key], "test", redis);

    const keys = invalidatedKeys();
    expect(keys).toEqual([
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${createShaHash("pk-lf-2", env.SALT!)}`,
      createAuthzContextCacheKey("bearer", createShaHash("pk-lf-2", env.SALT!)),
    ]);
    expect(keys.some((k) => k.startsWith(API_KEY_CACHE_KEY_PREFIX))).toBe(
      false,
    );
  });
});
