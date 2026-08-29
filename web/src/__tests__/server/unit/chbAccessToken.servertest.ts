import type * as SharedServer from "@langfuse/shared/src/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return { ...actual, logger: mocks.logger };
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

describe("chbAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("hands back a token whose claims cannot be decoded", async () => {
    // The provider reads iss/aud off the token to tag the APM span. That is a
    // diagnostic, so a token it cannot parse must not fail the billing request.
    fetchMock.mockResolvedValue(grant("not.base64url-{{.sig"));

    await expect(provider().getToken()).resolves.toBe("not.base64url-{{.sig");
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
});
