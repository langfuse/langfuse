import { type Redis } from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type ApiKey, type PrismaClient } from "@langfuse/shared/src/db";
import { InternalServerError, UnauthorizedError } from "@langfuse/shared";
import {
  AUTHZ_CONTEXT_CACHE_KEY_PREFIX,
  API_KEY_CACHE_KEY_PREFIX,
  createShaHash,
} from "@langfuse/shared/src/server";

import { Authenticator } from "@/src/features/apiKey/authenticator";
import { AuthenticatorCache } from "@/src/features/apiKey/authenticatorCache";
import {
  OrganizationRepository,
  type OrganizationWithProjects,
} from "@/src/features/auth/policy/organizationRepository";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { Verifier } from "@/src/features/apiKey/verifier";
import { type ApiKeyRepository } from "@/src/features/apiKey/apiKeyRepository";

const SALT = "test-salt";
const ORG = "org_1";
const PRJ = "prj_1";
const KNOWN_SECRET = "sk-lf-known";
const UNKNOWN_SECRET = "sk-lf-unknown";

const knownHash = createShaHash(KNOWN_SECRET, SALT);

const apiKey = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_p",
  createdAt: new Date(0),
  note: null,
  publicKey: "pk-lf-1",
  hashedSecretKey: "hsk",
  fastHashedSecretKey: knownHash,
  displaySecretKey: "sk-...abc",
  lastUsedAt: null,
  expiresAt: null,
  isInAppAgentKey: false,
  projectId: PRJ,
  orgId: ORG,
  scope: "PROJECT",
  createdByUserId: "user_1",
  createdByApiKeyId: null,
  ...over,
});

/** store resolves the known secret via the fast-hash index and misses everything else. */
const store = (key: ApiKey): ApiKeyRepository =>
  ({
    findByFastHash: async (hash: string) => ({
      success: true,
      apiKey: hash === key.fastHashedSecretKey ? key : null,
    }),
    findByPublicKey: async () => ({ success: true, apiKey: null }),
    verifySlow: async () => ({ success: true, valid: false }),
    backfillFastHash: async () => {},
  }) as unknown as ApiKeyRepository;

const orgRow = {
  id: ORG,
  cloudConfig: null,
  cloudFreeTierUsageThresholdState: null,
  projects: [{ id: PRJ }],
} as unknown as OrganizationWithProjects;

const resolver = new ContextResolver(
  new OrganizationRepository({
    organization: {
      findUnique: async () => orgRow,
      findFirst: async () => orgRow,
    },
  } as unknown as PrismaClient),
);

/** fakeRedis is an in-memory get/set store; overrides let a test make either op throw. */
function fakeRedis(
  overrides: Partial<{
    get: Redis["get"];
    set: Redis["set"];
  }> = {},
) {
  const map = new Map<string, string>();
  const redis = {
    map,
    get: overrides.get ?? (async (k: string) => map.get(k) ?? null),
    set:
      overrides.set ??
      (async (k: string, v: string) => {
        map.set(k, v);
        return "OK";
      }),
  };
  return redis as unknown as Redis & { map: Map<string, string> };
}

const bearer = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
});

describe("Authenticator consolidated context cache", () => {
  let verifier: Verifier;

  beforeEach(() => {
    verifier = new Verifier(store(apiKey()), SALT);
  });

  it("miss then hit: first call resolves via verify and caches; second call serves from cache without verifying", async () => {
    const redis = fakeRedis();
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const first = await auth.auth(bearer(KNOWN_SECRET));
    expect(first.success).toBe(true);
    expect([...redis.map.keys()]).toEqual([
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${knownHash}`,
    ]);

    const verifySpy = vi.spyOn(verifier, "verify");
    const second = await auth.auth(bearer(KNOWN_SECRET));
    expect(second.success).toBe(true);
    expect(verifySpy).not.toHaveBeenCalled();
    if (first.success && second.success) {
      expect(second.context).toStrictEqual(first.context);
    }
  });

  it("uses the authz:context: namespace, never the legacy api-key: prefix", async () => {
    const redis = fakeRedis();
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );
    await auth.auth(bearer(KNOWN_SECRET));
    const key = [...redis.map.keys()][0];
    expect(key.startsWith(AUTHZ_CONTEXT_CACHE_KEY_PREFIX)).toBe(true);
    expect(key.startsWith(API_KEY_CACHE_KEY_PREFIX)).toBe(false);
  });

  it("negative caching: an unknown credential's 401 is stored and replayed without verifying", async () => {
    const redis = fakeRedis();
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const first = await auth.auth(bearer(UNKNOWN_SECRET));
    expect(first.success).toBe(false);
    expect(first.error).toBeInstanceOf(UnauthorizedError);
    const stored = redis.map.get(
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${createShaHash(UNKNOWN_SECRET, SALT)}`,
    );
    expect(stored).toBeDefined();

    const verifySpy = vi.spyOn(verifier, "verify");
    const second = await auth.auth(bearer(UNKNOWN_SECRET));
    expect(verifySpy).not.toHaveBeenCalled();
    expect(second.success).toBe(false);
    if (!first.success && !second.success) {
      expect(second.error.message).toBe(first.error.message);
    }
  });

  it("fails open on a read error: falls through to verify and still authenticates", async () => {
    const redis = fakeRedis({
      get: (async () => {
        throw new Error("redis down");
      }) as unknown as Redis["get"],
    });
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );
    const result = await auth.auth(bearer(KNOWN_SECRET));
    expect(result.success).toBe(true);
  });

  it("fails open on a write error: swallows it and still authenticates", async () => {
    const redis = fakeRedis({
      set: (async () => {
        throw new Error("redis down");
      }) as unknown as Redis["set"],
    });
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );
    const result = await auth.auth(bearer(KNOWN_SECRET));
    expect(result.success).toBe(true);
  });

  it("in-app-agent key: cached and still gated off a cache hit", async () => {
    const agentKey = apiKey({ isInAppAgentKey: true });
    const agentVerifier = new Verifier(store(agentKey), SALT);
    const redis = fakeRedis();
    const auth = new Authenticator(
      agentVerifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const allowed = await auth.auth({
      headers: { authorization: `Bearer ${KNOWN_SECRET}` },
      allowInAppAgentKey: true,
    });
    expect(allowed.success).toBe(true);
    expect(redis.map.size).toBe(1);

    const verifySpy = vi.spyOn(agentVerifier, "verify");
    const gated = await auth.auth(bearer(KNOWN_SECRET));
    expect(verifySpy).not.toHaveBeenCalled();
    expect(gated.success).toBe(false);
    if (!gated.success) {
      expect(gated.error).toBeInstanceOf(UnauthorizedError);
    }
  });

  it("admin key, route disallows: gated off a cache hit", async () => {
    const redis = fakeRedis();
    const adminVerifier = new Verifier(store(apiKey()), SALT, KNOWN_SECRET);
    const auth = new Authenticator(
      adminVerifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const allowed = await auth.auth({
      ...bearer(KNOWN_SECRET),
      isAdminApiKeyAuthAllowed: true,
    });
    expect(allowed.success).toBe(true);
    expect(redis.map.size).toBe(1);

    const verifySpy = vi.spyOn(adminVerifier, "verify");
    const gated = await auth.auth(bearer(KNOWN_SECRET));
    expect(verifySpy).not.toHaveBeenCalled();
    expect(gated.success).toBe(false);
    if (!gated.success) {
      expect(gated.error).toBeInstanceOf(UnauthorizedError);
    }
  });

  it("no-ops the cache when disabled", async () => {
    const nullCacheAuth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(null, SALT),
    );
    const result = await nullCacheAuth.auth(bearer(KNOWN_SECRET));
    expect(result.success).toBe(true);
  });

  it("does not negatively cache a 500: a later call re-runs verify", async () => {
    const failing = {
      findByFastHash: async () => ({
        success: false,
        error: new InternalServerError("db down"),
      }),
      findByPublicKey: async () => ({ success: true, apiKey: null }),
      verifySlow: async () => ({ success: true, valid: false }),
      backfillFastHash: async () => {},
    } as unknown as ApiKeyRepository;
    const failingVerifier = new Verifier(failing, SALT);
    const redis = fakeRedis();
    const auth = new Authenticator(
      failingVerifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const first = await auth.auth(bearer(KNOWN_SECRET));
    expect(first.success).toBe(false);
    if (!first.success) expect(first.error).toBeInstanceOf(InternalServerError);
    expect(redis.map.size).toBe(0);

    const verifySpy = vi.spyOn(failingVerifier, "verify");
    const second = await auth.auth(bearer(KNOWN_SECRET));
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(second.success).toBe(false);
  });

  it("does not refresh the TTL on a read: a cache hit never writes", async () => {
    const redis = fakeRedis();
    const setSpy = vi.spyOn(redis, "set");
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    await auth.auth(bearer(KNOWN_SECRET));
    expect(setSpy).toHaveBeenCalledTimes(1);

    await auth.auth(bearer(KNOWN_SECRET));
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("get returns null on a miss, distinct from a replayed 401", async () => {
    const redis = fakeRedis();
    const cache = new AuthenticatorCache(redis, SALT);
    const credential = { kind: "bearer", token: UNKNOWN_SECRET } as const;

    expect(await cache.get(credential)).toBeNull();

    await cache.set(credential, {
      success: false,
      error: new UnauthorizedError("nope"),
    });
    const hit = await cache.get(credential);
    expect(hit?.success).toBe(false);
    if (hit && !hit.success) {
      expect(hit.error).toBeInstanceOf(UnauthorizedError);
    }
  });
});
