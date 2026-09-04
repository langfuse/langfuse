import { type Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import { type ApiKey } from "@langfuse/shared/src/db";
import {
  API_KEY_CACHE_KEY_PREFIX,
  AUTHZ_CONTEXT_CACHE_KEY_PREFIX,
  createShaHash,
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
  ...over,
});

/** delSpy captures the flat set of keys handed to safeMultiDel across single- or multi-key deletes. */
function delSpy() {
  const del = vi.fn((_keys: string[]): Promise<number> => Promise.resolve(1));
  const redis = { del } as unknown as Redis;
  const deletedKeys = () => del.mock.calls.flatMap((c) => c[0]);
  return { redis, deletedKeys };
}

describe("invalidateCachedApiKeys clears both cache namespaces", () => {
  it("deletes the legacy key plus both authz:context presentations per row", async () => {
    const { redis, deletedKeys } = delSpy();
    const key = apiKey({ fastHashedSecretKey: "fh1", publicKey: "pk-lf-1" });

    await invalidateCachedApiKeys([key], "test", redis);

    const keys = deletedKeys();
    expect(keys).toContain(`${API_KEY_CACHE_KEY_PREFIX}fh1`);
    expect(keys).toContain(`${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}fh1`);
    expect(keys).toContain(
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${createShaHash("pk-lf-1", env.SALT!)}`,
    );
  });

  it("covers a public-key-only row that never got a fast hash", async () => {
    const { redis, deletedKeys } = delSpy();
    const key = apiKey({ fastHashedSecretKey: null, publicKey: "pk-lf-2" });

    await invalidateCachedApiKeys([key], "test", redis);

    const keys = deletedKeys();
    expect(keys).toEqual([
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${createShaHash("pk-lf-2", env.SALT!)}`,
    ]);
    expect(keys.some((k) => k.startsWith(API_KEY_CACHE_KEY_PREFIX))).toBe(
      false,
    );
  });
});
