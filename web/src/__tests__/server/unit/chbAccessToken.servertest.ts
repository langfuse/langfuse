import type * as SharedServer from "@langfuse/shared/src/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RecordedSpan = { name: string; attributes: Record<string, unknown> };

const mocks = vi.hoisted(() => {
  const spans: RecordedSpan[] = [];

  /**
   * Stand-in for instrumentAsync that records the span name and every attribute
   * set on it, so a test can assert what APM would show.
   */
  const instrumentAsync = vi.fn(
    async (
      ctx: { name: string },
      callback: (span: unknown) => Promise<unknown>,
    ) => {
      const attributes: Record<string, unknown> = {};
      spans.push({ name: ctx.name, attributes });
      return await callback({
        setAttribute: (key: string, value: unknown) => {
          attributes[key] = value;
        },
        setAttributes: (values: Record<string, unknown>) => {
          Object.assign(attributes, values);
        },
        recordException: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      });
    },
  );

  return {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    spans,
    instrumentAsync,
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    logger: mocks.logger,
    instrumentAsync: mocks.instrumentAsync,
  };
});

import {
  ChbAccessTokenProvider,
  ChbAuthError,
} from "@/src/ee/features/billing/server/chb/chbAccessToken";

const AUTH0_DOMAIN = "chb-tenant.eu.auth0.com";
const TOKEN_URL = `https://${AUTH0_DOMAIN}/oauth/token`;

const jsonResponse = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const fetchMock = vi.fn();

const provider = () =>
  new ChbAccessTokenProvider({
    auth0Domain: AUTH0_DOMAIN,
    clientId: "client-id",
    clientSecret: "client-secret",
    audience: "billing-api",
  });

const grant = (accessToken: string, expiresIn = 86_400) =>
  jsonResponse(200, { access_token: accessToken, expires_in: expiresIn });

/** A JWT-shaped access token carrying the given claims — signature is filler. */
const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

const mintSpan = () => {
  const span = mocks.spans.find((s) => s.name === "chb.auth.token.mint");
  if (!span) throw new Error("no chb.auth.token.mint span was recorded");
  return span;
};

describe("chbAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spans.length = 0;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("exchanges the client credentials for an access token", async () => {
    fetchMock.mockResolvedValue(grant("token-1"));

    await expect(provider().getToken()).resolves.toBe("token-1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe("POST");
    // The Auth0 client uses client_secret_post, so the credentials belong in
    // the body — not a Basic header.
    expect(JSON.parse(init.body)).toEqual({
      grant_type: "client_credentials",
      client_id: "client-id",
      client_secret: "client-secret",
      audience: "billing-api",
    });
    // The secret must not ride along to a redirect target.
    expect(init.redirect).toBe("error");
  });

  it("caches the token instead of minting one per request", async () => {
    fetchMock.mockResolvedValue(grant("token-1"));
    const tokens = provider();

    await tokens.getToken();
    await tokens.getToken();
    await tokens.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent first calls into one grant", async () => {
    fetchMock.mockResolvedValue(grant("token-1"));
    const tokens = provider();

    const results = await Promise.all([
      tokens.getToken(),
      tokens.getToken(),
      tokens.getToken(),
    ]);

    // A burst of billing requests must not stampede Auth0.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["token-1", "token-1", "token-1"]);
  });

  it("mints a new token after invalidate()", async () => {
    fetchMock
      .mockResolvedValueOnce(grant("token-1"))
      .mockResolvedValueOnce(grant("token-2"));
    const tokens = provider();

    await expect(tokens.getToken()).resolves.toBe("token-1");
    tokens.invalidate();
    await expect(tokens.getToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renews ahead of expiry rather than at it", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(grant("token-1", 3_600))
      .mockResolvedValueOnce(grant("token-2", 3_600));
    const tokens = provider();

    await expect(tokens.getToken()).resolves.toBe("token-1");

    // Inside the lifetime but within the renewal margin: a token that expires
    // in transit would come back as a 401 from CHB.
    vi.advanceTimersByTime(3_400 * 1000);
    await expect(tokens.getToken()).resolves.toBe("token-2");
  });

  it("still caches a token whose lifetime is shorter than the margin", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(grant("token-1", 60));
    const tokens = provider();

    await tokens.getToken();
    vi.advanceTimersByTime(25 * 1000);
    await tokens.getToken();

    // Otherwise every single call would re-grant.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a usable buffer for a token barely longer than the margin", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(grant("token-1", 310))
      .mockResolvedValueOnce(grant("token-2", 310));
    const tokens = provider();

    await expect(tokens.getToken()).resolves.toBe("token-1");

    // Subtracting the full margin from a 310s token would leave a 10s buffer
    // before real expiry, so the margin has to be capped at half the lifetime:
    // this call is past that half and must re-grant rather than hand back a
    // token that can expire in transit.
    vi.advanceTimersByTime(160 * 1000);
    await expect(tokens.getToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("raises ChbAuthError when the grant is rejected", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: "access_denied", error_description: "..." }),
    );

    const error = await provider()
      .getToken()
      .catch((e) => e);

    expect(error).toBeInstanceOf(ChbAuthError);
    expect(error.status).toBe(401);
    // Auth0 error payloads echo request parameters, so they stay out of logs.
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "[CHB Auth] Client-credentials grant failed",
      { status: 401, audience: "billing-api" },
    );
  });

  it("raises ChbAuthError on a payload without a usable token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { expires_in: 86_400 }));

    await expect(provider().getToken()).rejects.toBeInstanceOf(ChbAuthError);
  });

  it("retries the grant after a failure instead of latching onto it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(grant("token-1"));
    const tokens = provider();

    await expect(tokens.getToken()).rejects.toBeInstanceOf(ChbAuthError);
    // The single-flight promise must not outlive its own rejection.
    await expect(tokens.getToken()).resolves.toBe("token-1");
  });

  describe("tracing", () => {
    it("spans the grant with the tenant and audience it asked for", async () => {
      fetchMock.mockResolvedValue(grant("token-1", 3_600));

      await provider().getToken();

      expect(mintSpan().attributes).toMatchObject({
        "chb.auth.domain": AUTH0_DOMAIN,
        "chb.auth.audience": "billing-api",
        "chb.auth.client_id": "client-id",
        "chb.auth.expires_in_seconds": 3_600,
        "http.status_code": 200,
      });
    });

    it("tags the issuer and audience CHB will verify the token against", async () => {
      fetchMock.mockResolvedValue(
        grant(
          jwt({
            iss: "https://chb-tenant.eu.auth0.com/",
            aud: ["billing-api", "https://chb-tenant.eu.auth0.com/userinfo"],
          }),
        ),
      );

      await provider().getToken();

      // These two claims are exactly what CHB's verifier checks, so a tenant or
      // audience mismatch is readable off the span without a reproduction.
      expect(mintSpan().attributes).toMatchObject({
        "chb.auth.token_format": "jwt",
        "chb.auth.token_issuer": "https://chb-tenant.eu.auth0.com/",
        "chb.auth.token_audience": [
          "billing-api",
          "https://chb-tenant.eu.auth0.com/userinfo",
        ],
      });
    });

    it("never tags the token itself", async () => {
      const accessToken = jwt({ iss: "https://t.eu.auth0.com/", aud: "a" });
      fetchMock.mockResolvedValue(grant(accessToken));

      await provider().getToken();

      const tagged = JSON.stringify(mintSpan().attributes);
      expect(tagged).not.toContain(accessToken);
      expect(tagged).not.toContain("signature");
    });

    it("flags an opaque token, which CHB's JWT verifier cannot accept", async () => {
      // Auth0 hands back an opaque token when the audience is not a registered
      // API — the request then fails at CHB with an unhelpful 401.
      fetchMock.mockResolvedValue(grant("opaque-token"));

      await provider().getToken();

      expect(mintSpan().attributes["chb.auth.token_format"]).toBe("opaque");
      expect(mintSpan().attributes).not.toHaveProperty("chb.auth.token_issuer");
    });

    it("survives a payload it cannot decode", async () => {
      fetchMock.mockResolvedValue(grant("not.base64url-{{.sig"));

      // A diagnostic must never be the reason a billing request fails.
      await expect(provider().getToken()).resolves.toBe("not.base64url-{{.sig");
      expect(mintSpan().attributes["chb.auth.token_format"]).toBe("jwt");
    });

    it("spans a rejected grant with its status", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, { error: "access_denied" }),
      );

      await provider()
        .getToken()
        .catch(() => undefined);

      expect(mintSpan().attributes["http.status_code"]).toBe(403);
    });
  });
});
