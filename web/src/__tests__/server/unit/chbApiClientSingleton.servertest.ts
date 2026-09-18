import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Web's per-process CHB client handle. The transport itself is tested in
 * `packages/shared/src/server/clickhouseBilling/chbApiClient.test.ts`; what is
 * web-specific — and what these cases pin — is that one client is shared across
 * billing requests so its token cache does any work at all.
 */

const mocks = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_BILLING_BASE_URL: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_DOMAIN: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_CLIENT_ID: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_AUDIENCE: "billing-api",
  },
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

import {
  ChbApiClient,
  getChbApiClient,
  resetChbApiClientForTests,
} from "@/src/ee/features/billing/server/chb/chbApiClient";

const CH_ORG_ID = "6dd6ab1d-9e8d-4c1a-8b4f-9a3d1e2c4b5a";
const AUTH0_DOMAIN = "chb-tenant.eu.auth0.com";
const TOKEN_URL = `https://${AUTH0_DOMAIN}/oauth/token`;

const jsonResponse = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

let tokenCounter = 0;

const fetchMock = vi.fn(async (url: URL | string) => {
  if (String(url) === TOKEN_URL) {
    tokenCounter += 1;
    return jsonResponse(200, {
      access_token: `chb-access-token-${tokenCounter}`,
      expires_in: 86_400,
    });
  }
  return jsonResponse(200, { portalUrl: "https://chb.example.com/portal" });
});

const tokenCalls = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) === TOKEN_URL);

const chbCalls = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) !== TOKEN_URL);

const setAll = () => {
  mocks.env.CLICKHOUSE_BILLING_BASE_URL = "https://chb.example.com";
  mocks.env.CLICKHOUSE_BILLING_AUTH0_DOMAIN = AUTH0_DOMAIN;
  mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID = "client-id";
  mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET = "client-secret";
};

describe("getChbApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenCounter = 0;
    mocks.env.CLICKHOUSE_BILLING_BASE_URL = undefined;
    mocks.env.CLICKHOUSE_BILLING_AUTH0_DOMAIN = undefined;
    mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID = undefined;
    mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET = undefined;
    vi.stubGlobal("fetch", fetchMock);
    resetChbApiClientForTests();
  });

  afterEach(() => {
    resetChbApiClientForTests();
    vi.unstubAllGlobals();
  });

  /**
   * The dispatch layer resolves a billing service per tRPC request. If that
   * handed back a fresh client each time, every billing call would mint a new
   * Auth0 token — the client's token cache and single-flight only do anything
   * when one instance is shared.
   */
  it("hands every caller the same client", () => {
    setAll();
    const first = getChbApiClient();
    expect(first).toBeInstanceOf(ChbApiClient);
    expect(getChbApiClient()).toBe(first);
    expect(getChbApiClient()).toBe(first);
  });

  it("mints one token across calls made through the shared client", async () => {
    setAll();

    // Two separate resolutions, as two billing procedures in one page load.
    await getChbApiClient()!.createPortalSession({
      chOrganizationId: CH_ORG_ID,
      returnUrl: "https://cloud.langfuse.com/return",
    });
    await getChbApiClient()!.createPortalSession({
      chOrganizationId: CH_ORG_ID,
      returnUrl: "https://cloud.langfuse.com/return",
    });

    expect(chbCalls()).toHaveLength(2);
    expect(tokenCalls()).toHaveLength(1);
  });

  it("caches the unconfigured verdict instead of re-reading env", () => {
    setAll();
    mocks.env.CLICKHOUSE_BILLING_BASE_URL = undefined;
    expect(getChbApiClient()).toBeNull();

    // Env cannot change under a running process; a later call must not
    // suddenly start talking to CHB.
    setAll();
    expect(getChbApiClient()).toBeNull();
  });
});
