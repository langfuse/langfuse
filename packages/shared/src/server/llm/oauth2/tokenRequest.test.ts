import { createHash, generateKeyPairSync } from "node:crypto";
import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  type CryptoKey,
  type JWK,
} from "jose";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  resolveOAuth2Profile,
  type OAuth2Config,
} from "../../../interfaces/oauth2Providers";
import {
  InvalidRedirectResponseError,
  MaxRedirectsExceededError,
} from "../../outbound-url/fetch";
import { OutboundUrlValidationError } from "../../outbound-url/validation";
import { fetchSecureLlmUrl } from "../secureLlmFetch";
import { prepareOAuth2Credential } from "./credential";
import { OAuth2TokenError } from "./errors";
import { createClientAssertion, requestOAuth2Token } from "./tokenRequest";

// The SSRF-safe transport is covered by its own suite; here it is replaced by
// a stub so the assertion target is the exact token request on the wire.
vi.mock("../secureLlmFetch", () => ({
  fetchSecureLlmUrl: vi.fn(),
}));

const fetchMock = vi.mocked(fetchSecureLlmUrl);

type CapturedRequest = {
  url: string;
  headers: Headers;
  body: URLSearchParams;
};

const captured: CapturedRequest[] = [];

function respondWith(...responses: Array<Response | Error>) {
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async (url, init) => {
      captured.push({
        url,
        headers: new Headers(init.headers),
        body: new URLSearchParams(init.body as string),
      });
      if (response instanceof Error) throw response;
      return response;
    });
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const tokenOk = () => json({ access_token: "t", expires_in: 3600 });

const TOKEN_ENDPOINT = "https://idp.example.com/oauth2/token";

const customProfile = (
  overrides: Partial<Extract<OAuth2Config, { provider: "custom" }>> = {},
) =>
  resolveOAuth2Profile({
    provider: "custom",
    clientId: "client-1",
    authMethod: "client_secret_basic",
    tokenEndpoint: TOKEN_ENDPOINT,
    ...overrides,
  });

const noSleep = vi.fn(async (_ms: number) => {});

async function request(
  profile: ReturnType<typeof resolveOAuth2Profile>,
  secret: string,
  maxRetries = 0,
) {
  return requestOAuth2Token({
    profile,
    credential: await prepareOAuth2Credential(profile, secret),
    maxRetries,
    sleep: noSleep,
  });
}

async function rejection(promise: Promise<unknown>): Promise<OAuth2TokenError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OAuth2TokenError);
  return error as OAuth2TokenError;
}

async function keyPair(alg: string, crv?: string) {
  const { privateKey, publicKey } = await generateKeyPair(alg, {
    extractable: true,
    ...(crv ? { crv } : {}),
  });
  return { privateJwk: await exportJWK(privateKey), publicKey };
}

afterEach(() => {
  captured.length = 0;
  fetchMock.mockReset();
  noSleep.mockClear();
  vi.restoreAllMocks();
});

describe("requestOAuth2Token request shape", () => {
  let rsa: { privateJwk: JWK; publicKey: CryptoKey };
  let ec: { privateJwk: JWK; publicKey: CryptoKey };
  // WebCrypto binds a key to one algorithm, so PS256 needs its own pair.
  let pss: { privateJwk: JWK; publicKey: CryptoKey };

  beforeAll(async () => {
    [rsa, ec, pss] = await Promise.all([
      keyPair("RS256"),
      keyPair("ES256"),
      keyPair("PS256"),
    ]);
  });

  test.each([
    ["RSA", "RS256", () => rsa],
    ["EC", "ES256", () => ec],
  ])(
    "custom private_key_jwt with %s key sends the spec.md contract",
    async (_name, alg, keys) => {
      const { privateJwk, publicKey } = keys();
      const profile = customProfile({
        authMethod: "private_key_jwt",
        scope: "llm.invoke",
      });
      respondWith(tokenOk());

      const nowSeconds = Math.floor(Date.now() / 1000);
      await request(profile, JSON.stringify({ ...privateJwk, kid: "key-1" }));

      expect(fetchMock).toHaveBeenCalledWith(
        TOKEN_ENDPOINT,
        expect.objectContaining({ method: "POST" }),
        { logContext: "OAuth2 token endpoint", maxRedirects: 0 },
      );
      const [{ url, headers, body }] = captured;
      expect(url).toBe(TOKEN_ENDPOINT);
      expect(headers.get("content-type")).toBe(
        "application/x-www-form-urlencoded",
      );
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("authorization")).toBeNull();
      expect([...body.keys()].sort()).toEqual([
        "client_assertion",
        "client_assertion_type",
        "grant_type",
        "scope",
      ]);
      expect(body.get("grant_type")).toBe("client_credentials");
      expect(body.get("scope")).toBe("llm.invoke");
      expect(body.get("client_assertion_type")).toBe(
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      );

      const assertion = body.get("client_assertion")!;
      expect(decodeProtectedHeader(assertion)).toEqual({
        alg,
        typ: "JWT",
        kid: "key-1",
      });
      const { payload } = await jwtVerify(assertion, publicKey, {
        algorithms: [alg],
      });
      expect(payload.iss).toBe("client-1");
      expect(payload.sub).toBe("client-1");
      expect(payload.aud).toBe(TOKEN_ENDPOINT);
      expect(payload.iat).toBeGreaterThanOrEqual(nowSeconds);
      expect(payload.exp! - payload.iat!).toBe(300);
      expect(payload.jti).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );

  test("custom private_key_jwt without scope or kid sends neither", async () => {
    const profile = customProfile({ authMethod: "private_key_jwt" });
    respondWith(tokenOk());

    await request(profile, JSON.stringify(rsa.privateJwk));

    const [{ body }] = captured;
    expect([...body.keys()].sort()).toEqual([
      "client_assertion",
      "client_assertion_type",
      "grant_type",
    ]);
    expect(decodeProtectedHeader(body.get("client_assertion")!)).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
  });

  test("createClientAssertion uses a new jti for each assertion", async () => {
    const profile = customProfile({ authMethod: "private_key_jwt" });
    const credential = await prepareOAuth2Credential(
      profile,
      JSON.stringify(rsa.privateJwk),
    );

    const [first, second] = await Promise.all([
      createClientAssertion(profile, credential),
      createClientAssertion(profile, credential),
    ]);
    const jti = async (jwt: string) =>
      (await jwtVerify(jwt, rsa.publicKey)).payload.jti;

    expect(await jti(first)).not.toBe(await jti(second));
  });

  test("createClientAssertion takes iat from nowMs", async () => {
    const profile = customProfile({ authMethod: "private_key_jwt" });
    const credential = await prepareOAuth2Credential(
      profile,
      JSON.stringify(rsa.privateJwk),
    );
    const nowMs = Date.now() - 10_000;

    const { payload } = await jwtVerify(
      await createClientAssertion(profile, credential, nowMs),
      rsa.publicKey,
    );

    expect(payload.iat).toBe(Math.floor(nowMs / 1000));
    expect(payload.exp).toBe(Math.floor(nowMs / 1000) + 300);
  });

  test("a key jose cannot sign with is a config error without a request", async () => {
    const profile = customProfile({ authMethod: "private_key_jwt" });
    // jose imports a 1024-bit RSA key but rejects it when signing.
    const weakJwk = generateKeyPairSync("rsa", {
      modulusLength: 1024,
    }).privateKey.export({ format: "jwk" });
    const credential = {
      signingKey: await importJWK(weakJwk as JWK, "RS256"),
      algorithm: "RS256",
      protectedHeader: {},
      fingerprint: createHash("sha256")
        .update(JSON.stringify(weakJwk))
        .digest("hex"),
    };

    const error = await rejection(
      requestOAuth2Token({
        profile,
        credential,
        maxRetries: 3,
        sleep: noSleep,
      }),
    );

    expect(error.kind).toBe("config");
    expect(error.message).toBe(
      "Could not sign the client assertion with the configured key",
    );
    expect(error.cause).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("entra private_key_jwt sends client_id and x5t#S256 with PS256", async () => {
    const profile = resolveOAuth2Profile({
      provider: "entra",
      clientId: "client-1",
      authMethod: "private_key_jwt",
      tenantId: "tenant-1",
      scope: "api://gateway/.default",
    });
    respondWith(tokenOk());

    await request(
      profile,
      JSON.stringify({ ...pss.privateJwk, "x5t#S256": "thumb" }),
    );

    const [{ url, body }] = captured;
    expect(url).toBe(
      "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token",
    );
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("scope")).toBe("api://gateway/.default");
    const assertion = body.get("client_assertion")!;
    expect(decodeProtectedHeader(assertion)).toEqual({
      alg: "PS256",
      typ: "JWT",
      "x5t#S256": "thumb",
    });
    const { payload } = await jwtVerify(assertion, pss.publicKey, {
      algorithms: ["PS256"],
    });
    expect(payload.aud).toBe(url);
  });

  test("auth0 private_key_jwt uses the issuer as aud and sends audience", async () => {
    const profile = resolveOAuth2Profile({
      provider: "auth0",
      clientId: "client-1",
      authMethod: "private_key_jwt",
      domain: "t.eu.auth0.com",
      audience: "https://gateway.example.com",
    });
    respondWith(tokenOk());

    await request(profile, JSON.stringify(rsa.privateJwk));

    const [{ url, body }] = captured;
    expect(url).toBe("https://t.eu.auth0.com/oauth/token");
    expect(body.get("audience")).toBe("https://gateway.example.com");
    expect(body.get("client_id")).toBeNull();
    const { payload } = await jwtVerify(
      body.get("client_assertion")!,
      rsa.publicKey,
    );
    expect(payload.aud).toBe("https://t.eu.auth0.com/");
  });

  test("client_secret_basic form-encodes id and secret in the header", async () => {
    const profile = customProfile({
      clientId: "a:b",
      authMethod: "client_secret_basic",
    });
    respondWith(tokenOk());

    await request(profile, "p +%");

    const [{ headers, body }] = captured;
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("a%3Ab" + ":" + "p%20%2B%25").toString("base64")}`,
    );
    expect([...body.keys()]).toEqual(["grant_type"]);
  });

  test("client_secret_post sends id and secret in the body", async () => {
    const profile = customProfile({ authMethod: "client_secret_post" });
    respondWith(tokenOk());

    await request(profile, "p +%");

    const [{ headers, body }] = captured;
    expect(headers.get("authorization")).toBeNull();
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("p +%");
  });

  test("client_secret_jwt signs an HS256 assertion with the secret", async () => {
    const secret = "s".repeat(32);
    const profile = customProfile({ authMethod: "client_secret_jwt" });
    respondWith(tokenOk());

    await request(profile, secret);

    const [{ body }] = captured;
    expect(body.get("client_secret")).toBeNull();
    const assertion = body.get("client_assertion")!;
    expect(decodeProtectedHeader(assertion)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    const { payload } = await jwtVerify(
      assertion,
      new TextEncoder().encode(secret),
    );
    expect(payload.sub).toBe("client-1");
  });
});

describe("requestOAuth2Token response handling", () => {
  const profile = customProfile({ authMethod: "client_secret_post" });

  test("returns the access token and expires_in", async () => {
    respondWith(tokenOk());

    await expect(request(profile, "s3cr3t")).resolves.toEqual({
      accessToken: "t",
      expiresInSeconds: 3600,
      attempts: 1,
    });
  });

  test("accepts expires_in as a numeric string", async () => {
    respondWith(json({ access_token: "t", expires_in: "3600" }));

    const result = await request(profile, "s3cr3t");

    expect(result.expiresInSeconds).toBe(3600);
  });

  test.each([
    ["missing", {}],
    ["negative", { expires_in: -5 }],
    ["not a number", { expires_in: "abc" }],
  ])("defaults expires_in to 300 when %s", async (_name, extra) => {
    respondWith(json({ access_token: "t", ...extra }));

    const result = await request(profile, "s3cr3t");

    expect(result.expiresInSeconds).toBe(300);
  });

  test("a 200 without access_token is a credential error", async () => {
    respondWith(json({ token_type: "Bearer" }));

    const error = await rejection(request(profile, "s3cr3t", 3));

    expect(error.kind).toBe("credential");
    expect(error.message).toBe("token response missing access_token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a 400 body echoing the secret and assertion is redacted", async () => {
    const jwtProfile = customProfile({ authMethod: "client_secret_jwt" });
    const secret = "s3cr3t s3cr3t s3cr3t s3cr3t s3cr3t";
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const sent = new URLSearchParams(init.body as string);
      const assertion = sent.get("client_assertion")!;
      captured.push({
        url: _url,
        headers: new Headers(init.headers),
        body: sent,
      });
      return json(
        {
          error: "invalid_client",
          echo: `client_secret=${encodeURIComponent(secret)}&raw=${secret}&form=${new URLSearchParams({ s: secret }).toString()}&client_assertion=${assertion}`,
        },
        400,
      );
    });

    const error = await rejection(request(jwtProfile, secret, 3));
    const assertion = captured[0].body.get("client_assertion")!;

    expect(error.kind).toBe("credential");
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/^OAuth2 token endpoint returned 400: /);
    expect(error.message).toContain("[redacted]");
    expect(error.message).not.toContain("s3cr3t");
    expect(error.message).not.toContain(assertion.slice(0, 40));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a 400 echoing a client_secret_post secret is redacted", async () => {
    respondWith(
      new Response("client_secret=s3cr3t+%2B&raw=s3cr3t +", { status: 400 }),
    );

    const error = await rejection(request(profile, "s3cr3t +"));

    expect(error.message).toBe(
      "OAuth2 token endpoint returned 400: client_secret=[redacted]&raw=[redacted]",
    );
  });

  test("a 400 echoing the client_secret_basic Authorization header is redacted", async () => {
    const basicProfile = customProfile({ authMethod: "client_secret_basic" });
    fetchMock.mockImplementationOnce(async (_url, init) =>
      json(
        {
          error: "invalid_client",
          received: new Headers(init.headers).get("authorization"),
        },
        400,
      ),
    );

    const error = await rejection(request(basicProfile, "s3cr3t"));

    expect(error.message).toBe(
      'OAuth2 token endpoint returned 400: {"error":"invalid_client","received":"Basic [redacted]"}',
    );
  });

  test.each([
    ["JSON-escaped", (s: string) => JSON.stringify(s).slice(1, -1)],
    [
      "JSON-escaped with escaped slashes",
      (s: string) => JSON.stringify(s).slice(1, -1).replaceAll("/", "\\/"),
    ],
  ])("a 400 echoing the %s secret is redacted", async (_name, escape) => {
    const secret = 's3cr3t"quote\\back/slash';
    respondWith(
      new Response(`{"client_secret":"${escape(secret)}"}`, { status: 400 }),
    );

    const error = await rejection(request(profile, secret));

    expect(error.message).toBe(
      'OAuth2 token endpoint returned 400: {"client_secret":"[redacted]"}',
    );
  });

  test("error body excerpts are truncated to 300 characters", async () => {
    respondWith(new Response("x".repeat(400), { status: 400 }));

    const error = await rejection(request(profile, "s3cr3t"));

    expect(error.message).toBe(
      `OAuth2 token endpoint returned 400: ${"x".repeat(300)}`,
    );
  });

  test.each([401, 403])(
    "%i is a credential error without retry",
    async (status) => {
      respondWith(json({ error: "invalid_client" }, status));

      const error = await rejection(request(profile, "s3cr3t", 3));

      expect(error.kind).toBe("credential");
      expect(error.status).toBe(status);
      expect(error.message).toBe(
        `OAuth2 token endpoint returned ${status}: {"error":"invalid_client"}`,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  test("a redirect is a credential error and is not followed", async () => {
    respondWith(
      new MaxRedirectsExceededError(0, [
        TOKEN_ENDPOINT,
        "https://elsewhere.example.com/token",
      ]),
    );

    const error = await rejection(request(profile, "s3cr3t", 3));

    expect(error.kind).toBe("credential");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a redirect without a usable Location is a credential error", async () => {
    respondWith(
      new InvalidRedirectResponseError(
        `Redirect response (302) missing Location header at ${TOKEN_ENDPOINT}`,
      ),
    );

    const error = await rejection(request(profile, "s3cr3t", 3));

    expect(error.kind).toBe("credential");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("an endpoint blocked by outbound URL validation is disabled without retry", async () => {
    // Connection-time validation surfaces inside undici's "fetch failed".
    respondWith(
      new TypeError("fetch failed", {
        cause: new OutboundUrlValidationError(
          "blocked-ip",
          "Blocked IP address detected",
        ),
      }),
    );

    const error = await rejection(request(profile, "s3cr3t", 3));

    expect(error.kind).toBe("disabled");
    expect(error.message).toBe(
      "OAuth2 token endpoint blocked: Blocked IP address detected",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("requestOAuth2Token retries", () => {
  const profile = customProfile({ authMethod: "client_secret_post" });

  test("retries 5xx with capped exponential backoff and full jitter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    respondWith(
      new Response("", { status: 503 }),
      new Response("", { status: 503 }),
      tokenOk(),
    );

    const result = await request(profile, "s3cr3t", 3);

    expect(result).toEqual({
      accessToken: "t",
      expiresInSeconds: 3600,
      attempts: 3,
    });
    expect(noSleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  test("jitter scales the wait down", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    respondWith(new Response("", { status: 500 }), tokenOk());

    await request(profile, "s3cr3t", 3);

    expect(noSleep).toHaveBeenCalledWith(500);
  });

  test.each([
    ["4", 4000],
    ["60", 10000],
  ])("429 with Retry-After %s waits %i ms", async (retryAfter, waitMs) => {
    respondWith(
      new Response("", { status: 429, headers: { "Retry-After": retryAfter } }),
      tokenOk(),
    );

    await request(profile, "s3cr3t", 3);

    expect(noSleep).toHaveBeenCalledExactlyOnceWith(waitMs);
  });

  test("network errors exhaust the retries as unavailable", async () => {
    respondWith(
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    );

    const error = await rejection(request(profile, "s3cr3t", 3));

    expect(error.kind).toBe("unavailable");
    expect(error.lastFailure).toBe("network");
    expect(error.message).toBe(
      "OAuth2 token endpoint unavailable after 4 attempts: network error",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(noSleep).toHaveBeenCalledTimes(3);
  });

  test("a timeout is reported as timeout", async () => {
    respondWith(new DOMException("The operation timed out.", "TimeoutError"));

    const error = await rejection(request(profile, "s3cr3t", 0));

    expect(error.lastFailure).toBe("timeout");
    expect(error.message).toBe(
      "OAuth2 token endpoint unavailable after 1 attempts: timeout",
    );
  });

  test("each attempt is bounded by its own timeout signal", async () => {
    respondWith(new Response("", { status: 502 }), tokenOk());

    await request(profile, "s3cr3t", 1);

    const signals = fetchMock.mock.calls.map(([, init]) => init.signal);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    expect(signals[0]).not.toBe(signals[1]);
  });

  test("a failed DNS lookup is retried", async () => {
    respondWith(
      new OutboundUrlValidationError(
        "dns-lookup-failed",
        "DNS lookup failed for idp.example.com",
      ),
      tokenOk(),
    );

    const result = await request(profile, "s3cr3t", 1);

    expect(result.attempts).toBe(2);
  });

  test.each([408, 429, 500, 503])("%i is retried", async (status) => {
    respondWith(new Response("", { status }), tokenOk());

    const result = await request(profile, "s3cr3t", 1);

    expect(result.attempts).toBe(2);
  });

  test("maxRetries 0 makes a single attempt", async () => {
    respondWith(new Response("", { status: 500 }));

    const error = await rejection(request(profile, "s3cr3t", 0));

    expect(error.kind).toBe("unavailable");
    expect(error.status).toBe(500);
    expect(error.lastFailure).toBe("status");
    expect(error.message).toBe(
      "OAuth2 token endpoint unavailable after 1 attempts: 500",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  test("each attempt signs a fresh assertion", async () => {
    const jwtProfile = customProfile({ authMethod: "client_secret_jwt" });
    const secret = "s".repeat(32);
    respondWith(new Response("", { status: 503 }), tokenOk());

    await request(jwtProfile, secret, 1);

    const jtis = await Promise.all(
      captured.map(
        async ({ body }) =>
          (
            await jwtVerify(
              body.get("client_assertion")!,
              new TextEncoder().encode(secret),
            )
          ).payload.jti,
      ),
    );
    expect(jtis).toHaveLength(2);
    expect(jtis[0]).not.toBe(jtis[1]);
  });
});
