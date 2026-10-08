import { type Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ApiKey, type PrismaClient } from "@langfuse/shared/src/db";
import {
  ForbiddenError,
  InternalServerError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  AUTHZ_CONTEXT_CACHE_KEY_PREFIX,
  API_KEY_CACHE_KEY_PREFIX,
  createShaHash,
  hashSecretKey,
} from "@langfuse/shared/src/server";

import { Authenticator } from "@/src/features/apiKey/server";
import { AuthenticatorCache } from "@/src/features/apiKey/authenticatorCache";
import {
  OrganizationRepository,
  type OrganizationWithProjects,
} from "@/src/features/auth/policy/organizationRepository";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { Verifier } from "@/src/features/apiKey/verifier";
import { type ApiKeyRepository } from "@/src/features/apiKey/apiKeyRepository";
import { env } from "@/src/env.mjs";

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
  createdAt: new Date("2026-09-16T00:00:00.000Z"),
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
  {
    roleAssignment: {
      findMany: async () => [
        {
          id: "assignment_1",
          orgId: ORG,
          principalApiKeyId: "key_p",
          principalUserId: null,
          ownerProjectId: PRJ,
          ownerOrgId: null,
          systemRole: "ADMIN",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    },
  } as unknown as PrismaClient,
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
  let originalCloudRegion: string | undefined;

  beforeEach(() => {
    verifier = new Verifier(store(apiKey()), SALT);
    originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (
      env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    (
      env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it("miss then hit: first call resolves via verify and caches; second call serves from cache without verifying", async () => {
    const redis = fakeRedis();
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const first = await auth.authenticate(bearer(KNOWN_SECRET));
    expect(first.success).toBe(true);
    expect([...redis.map.keys()]).toEqual([
      `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}v2:bearer:${knownHash}`,
    ]);

    const verifySpy = vi.spyOn(verifier, "verify");
    const second = await auth.authenticate(bearer(KNOWN_SECRET));
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
    await auth.authenticate(bearer(KNOWN_SECRET));
    const key = [...redis.map.keys()][0];
    expect(key.startsWith(AUTHZ_CONTEXT_CACHE_KEY_PREFIX)).toBe(true);
    expect(key.startsWith(API_KEY_CACHE_KEY_PREFIX)).toBe(false);
  });

  it("does not cache a 401: unknown credentials are verified on every request", async () => {
    const redis = fakeRedis();
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );
    const verifySpy = vi.spyOn(verifier, "verify");
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await auth.authenticate(bearer(UNKNOWN_SECRET));
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(UnauthorizedError);
    }
    expect(verifySpy).toHaveBeenCalledTimes(2);
    expect(redis.map.size).toBe(0);
  });

  it("does not let a Basic failure poison a public Bearer credential", async () => {
    const key = apiKey();
    const repository = store(key);
    repository.findByPublicKey = async (publicKey) => ({
      success: true,
      apiKey: publicKey === key.publicKey ? key : null,
    });
    const auth = new Authenticator(
      new Verifier(repository, SALT),
      resolver,
      new AuthenticatorCache(fakeRedis(), SALT),
    );

    const poisoned = await auth.authenticate({
      headers: {
        authorization: `Basic ${btoa(`unknown:${key.publicKey}`)}`,
      },
    });
    expect(poisoned.success).toBe(false);
    const legitimate = await auth.authenticate(bearer(key.publicKey));
    expect(legitimate.success).toBe(true);
    if (legitimate.success) {
      expect(legitimate.context.principal).toMatchObject({
        presentation: "publicKey",
      });
    }
  });

  it("does not reuse a public Bearer success for Basic authentication", async () => {
    const key = apiKey();
    const repository = store(key);
    repository.findByPublicKey = async (publicKey) => ({
      success: true,
      apiKey: publicKey === key.publicKey ? key : null,
    });
    const auth = new Authenticator(
      new Verifier(repository, SALT),
      resolver,
      new AuthenticatorCache(fakeRedis(), SALT),
    );
    expect((await auth.authenticate(bearer(key.publicKey))).success).toBe(true);
    expect(
      (
        await auth.authenticate({
          headers: {
            authorization: `Basic ${btoa(`unknown:${key.publicKey}`)}`,
          },
        })
      ).success,
    ).toBe(false);
  });

  it("allows slow-hash migration after a failure with a different Basic username", async () => {
    const key = apiKey({
      fastHashedSecretKey: null,
      hashedSecretKey: await hashSecretKey(KNOWN_SECRET),
    });
    const repository = store(key);
    repository.findByPublicKey = async (publicKey) => ({
      success: true,
      apiKey: publicKey === key.publicKey ? key : null,
    });
    const auth = new Authenticator(
      new Verifier(repository, SALT),
      resolver,
      new AuthenticatorCache(fakeRedis(), SALT),
    );
    const basic = (publicKey: string) => ({
      headers: {
        authorization: `Basic ${btoa(`${publicKey}:${KNOWN_SECRET}`)}`,
      },
    });
    expect((await auth.authenticate(basic("unknown"))).success).toBe(false);
    expect((await auth.authenticate(basic(key.publicKey))).success).toBe(true);
  });

  it("allows private Bearer authentication after Basic fast-hash migration", async () => {
    const key = apiKey({
      fastHashedSecretKey: null,
      hashedSecretKey: await hashSecretKey(KNOWN_SECRET),
    });
    const repository = store(key);
    repository.findByPublicKey = async (publicKey) => ({
      success: true,
      apiKey: publicKey === key.publicKey ? { ...key } : null,
    });
    repository.backfillFastHash = async (_id, hash) => {
      key.fastHashedSecretKey = hash;
    };
    const auth = new Authenticator(
      new Verifier(repository, SALT),
      resolver,
      new AuthenticatorCache(fakeRedis(), SALT),
    );

    expect((await auth.authenticate(bearer(KNOWN_SECRET))).success).toBe(false);
    expect(
      (
        await auth.authenticate({
          headers: {
            authorization: `Basic ${btoa(`${key.publicKey}:${KNOWN_SECRET}`)}`,
          },
        })
      ).success,
    ).toBe(true);
    expect((await auth.authenticate(bearer(KNOWN_SECRET))).success).toBe(true);
  });

  it("does not cache a private success when fast-hash backfill failed", async () => {
    const key = apiKey({
      fastHashedSecretKey: null,
      hashedSecretKey: await hashSecretKey(KNOWN_SECRET),
    });
    const repository = store(key);
    const findByPublicKey = vi.fn(async () => ({
      success: true as const,
      apiKey: key as ApiKey | null,
    }));
    repository.findByPublicKey = findByPublicKey;
    const redis = fakeRedis();
    const auth = new Authenticator(
      new Verifier(repository, SALT),
      resolver,
      new AuthenticatorCache(redis, SALT),
    );
    const request = {
      headers: {
        authorization: `Basic ${btoa(`${key.publicKey}:${KNOWN_SECRET}`)}`,
      },
    };

    expect((await auth.authenticate(request)).success).toBe(true);
    findByPublicKey.mockResolvedValue({ success: true, apiKey: null });
    expect((await auth.authenticate(request)).success).toBe(false);
  });

  it("preserves arbitrary Basic usernames for fast-hash secrets in both cache states", async () => {
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(fakeRedis(), SALT),
    );
    for (const publicKey of ["unmatched-cold", "unmatched-warm"]) {
      expect(
        (
          await auth.authenticate({
            headers: {
              authorization: `Basic ${btoa(`${publicKey}:${KNOWN_SECRET}`)}`,
            },
          })
        ).success,
      ).toBe(true);
    }
    expect((await auth.authenticate(bearer(KNOWN_SECRET))).success).toBe(true);
  });

  it.each(["null", "{}", '{"unauthorized":"Invalid credentials"}', "{"])(
    "ignores cache entries without a readable context: %s",
    async (raw) => {
      const redis = fakeRedis({
        get: (async () => raw) as Redis["get"],
      });
      const cache = new AuthenticatorCache(redis, SALT);
      expect(
        await cache.get({ kind: "bearer", token: KNOWN_SECRET }),
      ).toBeNull();
    },
  );

  it("ignores contexts from an earlier cache namespace", async () => {
    const redis = fakeRedis();
    redis.map.set(
      `authz:context:${knownHash}`,
      JSON.stringify({
        context: { principal: { kind: "admin", userId: null }, policies: [] },
      }),
    );
    const auth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );
    expect((await auth.authenticate(bearer(KNOWN_SECRET))).success).toBe(true);
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
    const result = await auth.authenticate(bearer(KNOWN_SECRET));
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
    const result = await auth.authenticate(bearer(KNOWN_SECRET));
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

    const allowed = await auth.authenticate({
      headers: { authorization: `Bearer ${KNOWN_SECRET}` },
      allowInAppAgentKey: true,
    });
    expect(allowed.success).toBe(true);
    expect(redis.map.size).toBe(1);

    const verifySpy = vi.spyOn(agentVerifier, "verify");
    const gated = await auth.authenticate(bearer(KNOWN_SECRET));
    expect(verifySpy).not.toHaveBeenCalled();
    expect(gated.success).toBe(false);
    if (!gated.success) {
      expect(gated.error).toBeInstanceOf(UnauthorizedError);
    }
  });

  it("does not cache environment admin authentication and still enforces route opt-in", async () => {
    const redis = fakeRedis();
    const adminVerifier = new Verifier(store(apiKey()), SALT, KNOWN_SECRET);
    const auth = new Authenticator(
      adminVerifier,
      resolver,
      new AuthenticatorCache(redis, SALT, ""),
    );

    const allowed = await auth.authenticate({
      ...bearer(KNOWN_SECRET),
      isAdminApiKeyAuthAllowed: true,
    });
    expect(allowed.success).toBe(true);
    expect(redis.map.size).toBe(0);

    const verifySpy = vi.spyOn(adminVerifier, "verify");
    const gated = await auth.authenticate(bearer(KNOWN_SECRET));
    expect(verifySpy).toHaveBeenCalledOnce();
    expect(gated.success).toBe(false);
    if (!gated.success) {
      expect(gated.error).toBeInstanceOf(UnauthorizedError);
    }
  });

  it.each(["rotated-admin-secret", ""])(
    "rejects the old environment admin credential after configuration changes to %j",
    async (adminApiKey) => {
      const redis = fakeRedis();
      const oldAdminKey = "old-admin-secret";
      const request = {
        ...bearer(oldAdminKey),
        isAdminApiKeyAuthAllowed: true,
      };
      const oldAuth = new Authenticator(
        new Verifier(store(apiKey()), SALT, oldAdminKey),
        resolver,
        new AuthenticatorCache(redis, SALT, oldAdminKey),
      );
      expect((await oldAuth.authenticate(request)).success).toBe(true);

      const newAuth = new Authenticator(
        new Verifier(store(apiKey()), SALT, adminApiKey),
        resolver,
        new AuthenticatorCache(redis, SALT, adminApiKey),
      );
      const result = await newAuth.authenticate(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(UnauthorizedError);
      }
    },
  );

  it("recognizes a cached database credential as the newly configured environment admin", async () => {
    const redis = fakeRedis();
    const auth = new Authenticator(
      new Verifier(store(apiKey()), SALT, ""),
      resolver,
      new AuthenticatorCache(redis, SALT, ""),
    );
    const request = {
      ...bearer(KNOWN_SECRET),
      isAdminApiKeyAuthAllowed: true,
    };
    expect(await auth.authenticate(request)).toMatchObject({
      success: true,
      context: { principal: { kind: "apiKey" } },
    });
    expect(redis.map.size).toBe(1);

    const adminApiKey = ` ${KNOWN_SECRET} `;
    const adminVerifier = new Verifier(store(apiKey()), SALT, adminApiKey);
    const promotedAuth = new Authenticator(
      adminVerifier,
      resolver,
      new AuthenticatorCache(redis, SALT, adminApiKey),
    );
    const getSpy = vi.spyOn(redis, "get");
    const setSpy = vi.spyOn(redis, "set");
    expect(await promotedAuth.authenticate(request)).toMatchObject({
      success: true,
      context: { principal: { kind: "admin" } },
    });
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();

    const basic = {
      headers: {
        authorization: `Basic ${btoa(`unknown:${KNOWN_SECRET}`)}`,
      },
    };
    expect(await promotedAuth.authenticate(basic)).toMatchObject({
      success: true,
      context: { principal: { kind: "apiKey" } },
    });
    const verifySpy = vi.spyOn(adminVerifier, "verify");
    expect((await promotedAuth.authenticate(basic)).success).toBe(true);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("admin key on a cloud region: 403s even when the route allows it", async () => {
    (
      env as { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string }
    ).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    const auth = new Authenticator(
      new Verifier(store(apiKey()), SALT, KNOWN_SECRET),
      resolver,
      new AuthenticatorCache(fakeRedis(), SALT),
    );
    const result = await auth.authenticate({
      ...bearer(KNOWN_SECRET),
      isAdminApiKeyAuthAllowed: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ForbiddenError);
    }
  });

  it("no-ops the cache when disabled", async () => {
    const nullCacheAuth = new Authenticator(
      verifier,
      resolver,
      new AuthenticatorCache(null, SALT),
    );
    const result = await nullCacheAuth.authenticate(bearer(KNOWN_SECRET));
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

    const first = await auth.authenticate(bearer(KNOWN_SECRET));
    expect(first.success).toBe(false);
    if (!first.success) expect(first.error).toBeInstanceOf(InternalServerError);
    expect(redis.map.size).toBe(0);

    const verifySpy = vi.spyOn(failingVerifier, "verify");
    const second = await auth.authenticate(bearer(KNOWN_SECRET));
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

    await auth.authenticate(bearer(KNOWN_SECRET));
    expect(setSpy).toHaveBeenCalledTimes(1);

    await auth.authenticate(bearer(KNOWN_SECRET));
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("caps a context's TTL at the key's remaining lifetime", async () => {
    const expiringVerifier = new Verifier(
      store(apiKey({ expiresAt: new Date(Date.now() + 10_000) })),
      SALT,
    );
    const redis = fakeRedis();
    const setSpy = vi.spyOn(redis, "set");
    const auth = new Authenticator(
      expiringVerifier,
      resolver,
      new AuthenticatorCache(redis, SALT),
    );

    const result = await auth.authenticate(bearer(KNOWN_SECRET));

    expect(result.success).toBe(true);
    expect(setSpy).toHaveBeenCalledOnce();
    const ttl = setSpy.mock.calls[0][3] as unknown as number;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });
});
