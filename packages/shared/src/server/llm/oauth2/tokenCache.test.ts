import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ResolvedOAuth2Profile } from "../../../interfaces/oauth2Providers";
import { logger } from "../../logger";
import type { PreparedOAuth2Credential } from "./credential";
import { OAuth2TokenError } from "./errors";
import {
  clearOAuth2TokenCache,
  getOAuth2AccessToken,
  getOAuth2CacheKey,
  invalidateOAuth2AccessToken,
} from "./tokenCache";
import { requestOAuth2Token } from "./tokenRequest";

// The token request itself is covered by its own suite; here it is replaced
// so the assertion target is how often a request is made.
vi.mock("./tokenRequest", () => ({
  requestOAuth2Token: vi.fn(),
}));

const requestMock = vi.mocked(requestOAuth2Token);

const TOKEN_ENDPOINT = "https://idp.example.com/oauth2/token";

const profile: ResolvedOAuth2Profile = {
  provider: "custom",
  tokenEndpoint: TOKEN_ENDPOINT,
  clientId: "client-id-123",
  authMethod: "client_secret_post",
  assertionAudience: TOKEN_ENDPOINT,
  sendClientIdWithAssertion: false,
  formParams: { scope: "api://gateway/.default" },
  defaultRsaAlgorithm: "RS256",
  requireX5tS256: false,
};

const credentialFor = (secret: string): PreparedOAuth2Credential => ({
  secret,
  fingerprint: createHash("sha256").update(secret).digest("hex"),
});

const credential = credentialFor("secret-one");

const token = (accessToken: string, expiresInSeconds = 3600) => ({
  accessToken,
  expiresInSeconds,
  attempts: 1,
});

const unavailable = (
  lastFailure: "network" | "timeout" | "status" = "network",
) =>
  new OAuth2TokenError(
    "unavailable",
    `OAuth2 token endpoint unavailable after 4 attempts: ${
      lastFailure === "status" ? "429" : `${lastFailure} error`
    }`,
    { lastFailure, ...(lastFailure === "status" ? { status: 429 } : {}) },
  );

describe("getOAuth2AccessToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearOAuth2TokenCache();
    requestMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("serves a cached token until expires_in minus 60 seconds", async () => {
    requestMock
      .mockResolvedValueOnce(token("token-1", 3600))
      .mockResolvedValueOnce(token("token-2", 3600));

    const first = await getOAuth2AccessToken({ profile, credential });
    await vi.advanceTimersByTimeAsync(3540 * 1000 - 1);
    const second = await getOAuth2AccessToken({ profile, credential });

    expect(first.accessToken).toBe("token-1");
    expect(second.accessToken).toBe("token-1");
    expect(requestMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2);
    const third = await getOAuth2AccessToken({ profile, credential });

    expect(third.accessToken).toBe("token-2");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("refetches on every call when expires_in is at most 60 seconds", async () => {
    requestMock
      .mockResolvedValueOnce(token("token-1", 30))
      .mockResolvedValueOnce(token("token-2", 30));

    const first = await getOAuth2AccessToken({ profile, credential });
    const second = await getOAuth2AccessToken({ profile, credential });

    expect(first.accessToken).toBe("token-1");
    expect(second.accessToken).toBe("token-2");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("concurrent callers share one request", async () => {
    let resolveRequest: (value: ReturnType<typeof token>) => void = () => {};
    requestMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const calls = Array.from({ length: 10 }, () =>
      getOAuth2AccessToken({ profile, credential }),
    );
    resolveRequest(token("shared-token"));
    const results = await Promise.all(calls);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.accessToken)).toEqual(
      Array(10).fill("shared-token"),
    );
  });

  test("does not cache a failed fetch", async () => {
    requestMock
      .mockRejectedValueOnce(
        new OAuth2TokenError(
          "credential",
          "OAuth2 token endpoint returned 401: invalid_client",
        ),
      )
      .mockResolvedValueOnce(token("token-after-failure"));

    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "credential" });
    const second = await getOAuth2AccessToken({ profile, credential });

    expect(second.accessToken).toBe("token-after-failure");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("a different secret gets its own cache key and token", async () => {
    requestMock
      .mockResolvedValueOnce(token("token-one"))
      .mockResolvedValueOnce(token("token-two"));
    const otherCredential = credentialFor("secret-two");

    const first = await getOAuth2AccessToken({ profile, credential });
    const second = await getOAuth2AccessToken({
      profile,
      credential: otherCredential,
    });

    expect(first.cacheKey).not.toBe(second.cacheKey);
    expect(second.accessToken).toBe("token-two");
    expect(requestMock).toHaveBeenCalledTimes(2);
    for (const key of [first.cacheKey, second.cacheKey]) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).not.toContain("secret-one");
      expect(key).not.toContain("secret-two");
      expect(key).not.toContain(profile.clientId);
    }
  });

  test("the cache key covers the profile fields that shape the request", () => {
    const base = getOAuth2CacheKey(profile, credential);

    expect(getOAuth2CacheKey({ ...profile }, { ...credential })).toBe(base);
    expect(
      getOAuth2CacheKey(
        {
          ...profile,
          formParams: { resource: "r", scope: "api://gateway/.default" },
        },
        credential,
      ),
    ).toBe(
      getOAuth2CacheKey(
        {
          ...profile,
          formParams: { scope: "api://gateway/.default", resource: "r" },
        },
        credential,
      ),
    );
    for (const changed of [
      { tokenEndpoint: "https://other.example.com/token" },
      { authMethod: "client_secret_basic" as const },
      { clientId: "other-client" },
      { formParams: { scope: "other" } },
      { assertionAudience: "https://other.example.com" },
      { sendClientIdWithAssertion: true },
      { assertionAlgorithm: "HS512" },
    ]) {
      expect(
        getOAuth2CacheKey({ ...profile, ...changed }, credential),
      ).not.toBe(base);
    }
    expect(
      getOAuth2CacheKey(profile, { ...credential, algorithm: "HS384" }),
    ).not.toBe(base);
  });

  test.each(["network", "timeout"] as const)(
    "an endpoint that ended unavailable after a %s failure fails fast for every credential for 30 seconds",
    async (lastFailure) => {
      requestMock.mockRejectedValueOnce(unavailable(lastFailure));
      const otherCredential = credentialFor("secret-two");

      await expect(
        getOAuth2AccessToken({ profile, credential }),
      ).rejects.toMatchObject({ kind: "unavailable" });
      expect(requestMock).toHaveBeenCalledTimes(1);

      const failFast = await getOAuth2AccessToken({
        profile: { ...profile, clientId: "other-client" },
        credential: otherCredential,
      }).catch((error: unknown) => error);
      expect(failFast).toBeInstanceOf(OAuth2TokenError);
      expect(failFast).toMatchObject({ kind: "unavailable" });
      expect(requestMock).toHaveBeenCalledTimes(1);
    },
  );

  test("a credential that ended unavailable after HTTP statuses does not block other credentials on the endpoint", async () => {
    requestMock
      .mockRejectedValueOnce(unavailable("status"))
      .mockResolvedValueOnce(token("other-client-token"));

    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    const other = await getOAuth2AccessToken({
      profile: { ...profile, clientId: "other-client" },
      credential: credentialFor("secret-two"),
    });

    expect(other.accessToken).toBe("other-client-token");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("a credential that ended unavailable after HTTP statuses fails fast for 30 seconds", async () => {
    requestMock.mockRejectedValueOnce(unavailable("status"));

    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(30_000 - 1);
    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(requestMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    requestMock.mockResolvedValueOnce(token("token-after-throttling"));
    const recovered = await getOAuth2AccessToken({ profile, credential });

    expect(recovered.accessToken).toBe("token-after-throttling");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("an unavailable endpoint fails fast for 30 seconds", async () => {
    requestMock.mockRejectedValueOnce(unavailable());
    const otherCredential = credentialFor("secret-two");

    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(requestMock).toHaveBeenCalledTimes(1);

    const failFast = await getOAuth2AccessToken({
      profile,
      credential: otherCredential,
    }).catch((error: unknown) => error);
    expect(failFast).toBeInstanceOf(OAuth2TokenError);
    expect(failFast).toMatchObject({ kind: "unavailable" });
    expect((failFast as Error).message).not.toContain("secret");
    expect(requestMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    requestMock.mockResolvedValueOnce(token("token-after-outage"));
    const recovered = await getOAuth2AccessToken({
      profile,
      credential: otherCredential,
    });

    expect(recovered.accessToken).toBe("token-after-outage");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("the fail-fast window applies per normalized token endpoint", async () => {
    requestMock
      .mockRejectedValueOnce(unavailable())
      .mockResolvedValueOnce(token("other-endpoint-token"));

    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(
      getOAuth2AccessToken({
        profile: {
          ...profile,
          tokenEndpoint: "HTTPS://IDP.EXAMPLE.COM:443/oauth2/token",
        },
        credential: credentialFor("secret-two"),
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    const other = await getOAuth2AccessToken({
      profile: { ...profile, tokenEndpoint: "https://other.example.com/token" },
      credential,
    });

    expect(other.accessToken).toBe("other-endpoint-token");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("a successful fetch clears the fail-fast window", async () => {
    let resolveInFlight: (value: ReturnType<typeof token>) => void = () => {};
    requestMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInFlight = resolve;
        }),
      )
      .mockRejectedValueOnce(unavailable())
      .mockResolvedValueOnce(token("token-three"));

    // A fetch that started before the outage was noticed succeeds after it.
    const inFlight = getOAuth2AccessToken({ profile, credential });
    await expect(
      getOAuth2AccessToken({
        profile,
        credential: credentialFor("secret-two"),
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    resolveInFlight(token("token-one"));
    await inFlight;

    const third = await getOAuth2AccessToken({
      profile,
      credential: credentialFor("secret-three"),
    });

    expect(third.accessToken).toBe("token-three");
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  test("a credential error does not open the fail-fast window", async () => {
    requestMock
      .mockRejectedValueOnce(
        new OAuth2TokenError(
          "credential",
          "OAuth2 token endpoint returned 401: invalid_client",
        ),
      )
      .mockResolvedValueOnce(token("token-two"));

    await expect(
      getOAuth2AccessToken({ profile, credential }),
    ).rejects.toMatchObject({ kind: "credential" });
    const second = await getOAuth2AccessToken({
      profile,
      credential: credentialFor("secret-two"),
    });

    expect(second.accessToken).toBe("token-two");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("invalidating a key makes the next call refetch", async () => {
    requestMock
      .mockResolvedValueOnce(token("token-1"))
      .mockResolvedValueOnce(token("token-2"));

    const first = await getOAuth2AccessToken({ profile, credential });
    invalidateOAuth2AccessToken(first.cacheKey, first.accessToken);
    const second = await getOAuth2AccessToken({ profile, credential });

    expect(second.accessToken).toBe("token-2");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("callers rejected with the same token share one refetch", async () => {
    let resolveRefetch: (value: ReturnType<typeof token>) => void = () => {};
    requestMock.mockResolvedValueOnce(token("token-1")).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefetch = resolve;
      }),
    );

    // A and B both hold token-1 and both get a 401 for it.
    const a = await getOAuth2AccessToken({ profile, credential });
    const b = await getOAuth2AccessToken({ profile, credential });
    invalidateOAuth2AccessToken(a.cacheKey, a.accessToken);
    const aRetry = getOAuth2AccessToken({ profile, credential });
    invalidateOAuth2AccessToken(b.cacheKey, b.accessToken);
    const bRetry = getOAuth2AccessToken({ profile, credential });
    resolveRefetch(token("token-2"));

    await expect(aRetry).resolves.toMatchObject({ accessToken: "token-2" });
    await expect(bRetry).resolves.toMatchObject({ accessToken: "token-2" });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("invalidating an older token leaves the cached newer token", async () => {
    requestMock
      .mockResolvedValueOnce(token("token-1"))
      .mockResolvedValueOnce(token("token-2"));

    const first = await getOAuth2AccessToken({ profile, credential });
    invalidateOAuth2AccessToken(first.cacheKey, "token-1");
    await getOAuth2AccessToken({ profile, credential });
    invalidateOAuth2AccessToken(first.cacheKey, "token-1");
    const third = await getOAuth2AccessToken({ profile, credential });

    expect(third.accessToken).toBe("token-2");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("logs each successful fetch without the token or secret", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    requestMock.mockResolvedValueOnce({
      accessToken: "access-token-value",
      expiresInSeconds: 3600,
      attempts: 2,
    });

    await getOAuth2AccessToken({ profile, credential, projectId: "project-1" });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("OAuth2 access token fetched", {
      projectId: "project-1",
      provider: "custom",
      host: "idp.example.com",
      authMethod: "client_secret_post",
      expiresIn: 3600,
      attempts: 2,
    });
    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).not.toContain("access-token-value");
    expect(logged).not.toContain("secret-one");
  });

  test("passes the configured retry budget to the token request", async () => {
    requestMock.mockResolvedValueOnce(token("token-1"));

    await getOAuth2AccessToken({ profile, credential });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ profile, credential, maxRetries: 3 }),
    );
  });
});
