import type * as SharedServer from "@langfuse/shared/src/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_BILLING_BASE_URL: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_DOMAIN: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_CLIENT_ID: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET: undefined as string | undefined,
    CLICKHOUSE_BILLING_AUTH0_AUDIENCE: "billing-api",
  },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return { ...actual, logger: mocks.logger };
});

import {
  ChbApiClient,
  ChbApiError,
  ChbPaymentRequiredError,
  createChbApiClientFromEnv,
} from "@/src/ee/features/billing/server/chb/chbApiClient";

const CH_ORG_ID = "6dd6ab1d-9e8d-4c1a-8b4f-9a3d1e2c4b5a";
const AUTH0_DOMAIN = "chb-tenant.eu.auth0.com";
const TOKEN_URL = `https://${AUTH0_DOMAIN}/oauth/token`;

/** Shape a `fetch` result the client will accept, or one it must reject. */
const jsonResponse = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

/**
 * One mock for both legs the client makes: the Auth0 client-credentials grant
 * and the CHB request itself. Responses for the CHB leg are queued, so a test
 * can drive a 401-then-200 replay.
 */
const chbResponses: ReturnType<typeof jsonResponse>[] = [];
let tokenCounter = 0;

const fetchMock = vi.fn(async (url: URL | string, _init: RequestInit) => {
  if (String(url) === TOKEN_URL) {
    tokenCounter += 1;
    return jsonResponse(200, {
      access_token: `chb-access-token-${tokenCounter}`,
      expires_in: 86_400,
    });
  }
  return chbResponses.shift() ?? jsonResponse(200, {});
});

/** Queue the CHB leg's response(s), in order. */
const onChb = (...responses: ReturnType<typeof jsonResponse>[]) => {
  chbResponses.push(...responses);
};

const tokenCalls = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) === TOKEN_URL);

const chbCalls = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) !== TOKEN_URL);

/** The client's last request to CHB itself, as (url, init). */
const lastChbCall = () => {
  const call = chbCalls().at(-1);
  if (!call) throw new Error("the client never called CHB");
  return { url: call[0] as URL, init: call[1] };
};

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

const client = () =>
  new ChbApiClient({
    // Deliberately carries a path prefix: the URL join must keep it.
    baseUrl: "https://chb.example.com/api/v1",
    auth: {
      auth0Domain: AUTH0_DOMAIN,
      clientId: "client-id",
      clientSecret: "client-secret",
      audience: "billing-api",
    },
  });

describe("chbApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chbResponses.length = 0;
    tokenCounter = 0;
    mocks.env.CLICKHOUSE_BILLING_BASE_URL = undefined;
    mocks.env.CLICKHOUSE_BILLING_AUTH0_DOMAIN = undefined;
    mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID = undefined;
    mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET = undefined;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("authentication", () => {
    it("presents the Auth0 access token and never follows a redirect", async () => {
      onChb(jsonResponse(200, { url: "https://pay.example.com/s/1" }));

      await client().createPortalSession({
        chOrganizationId: CH_ORG_ID,
        returnUrl: "https://cloud.langfuse.com/back",
      });

      // CHB verifies the token against Auth0, so a static secret would 401.
      const { init } = lastChbCall();
      expect(headersOf(init).authorization).toBe("Bearer chb-access-token-1");
      // A redirect would replay the token against the redirect target.
      expect(init.redirect).toBe("error");
    });

    it("reuses one token across requests", async () => {
      onChb(jsonResponse(200, { id: "bundle_1" }), jsonResponse(200, {}));
      const chb = client();

      await chb.getBundle({ chOrganizationId: CH_ORG_ID, bundleId: "b1" });
      await chb.clearScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "b1",
      });

      expect(tokenCalls()).toHaveLength(1);
      expect(chbCalls()).toHaveLength(2);
    });

    it("mints a fresh token and replays once when CHB rejects the token", async () => {
      onChb(
        jsonResponse(401, { error: "Invalid or expired token" }),
        jsonResponse(200, {}),
      );

      await client().setScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "b1",
        change: { type: "cancel", when: "billing_cycle_end" },
        idempotencyKey: "chb.bundle.scheduled.set:bundleId=b1:op=abc",
      });

      expect(tokenCalls()).toHaveLength(2);
      const [first, second] = chbCalls();
      expect(headersOf(first![1]).authorization).toBe(
        "Bearer chb-access-token-1",
      );
      expect(headersOf(second![1]).authorization).toBe(
        "Bearer chb-access-token-2",
      );
      // The replay must stay idempotent on CHB's side.
      expect(headersOf(second![1])["Idempotency-Key"]).toBe(
        "chb.bundle.scheduled.set:bundleId=b1:op=abc",
      );
    });

    it("surfaces a 401 that survives the replay", async () => {
      onChb(jsonResponse(401, {}), jsonResponse(401, {}));

      const error = await client()
        .getBundle({ chOrganizationId: CH_ORG_ID, bundleId: "b1" })
        .catch((e) => e);

      // One replay, not a loop.
      expect(chbCalls()).toHaveLength(2);
      expect(error).toBeInstanceOf(ChbApiError);
      expect(error.status).toBe(401);
    });
  });

  describe("request wiring", () => {
    it("keeps the base url path prefix when joining the request path", async () => {
      onChb(jsonResponse(200, { id: "bundle_1" }));

      await client().getBundle({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
      });

      expect(lastChbCall().url.toString()).toBe(
        "https://chb.example.com/api/v1/bundles/bundle_1?fields=plan%2Cperiod%2Cpayment%2Cscheduled",
      );
    });

    it("url-encodes the bundle id into the path", async () => {
      onChb(jsonResponse(202, {}));

      await client().clearScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "../admin/bundles/other",
      });

      // Escaping matters: an unencoded id would let a caller-supplied value
      // climb out of the bundles collection.
      expect(lastChbCall().url.pathname).toBe(
        "/api/v1/bundles/..%2Fadmin%2Fbundles%2Fother/scheduled",
      );
    });

    it("scopes org endpoints with CH-Organization-Id and omits it elsewhere", async () => {
      onChb(jsonResponse(200, { id: "bundle_1" }));
      await client().getBundle({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
      });
      expect(headersOf(lastChbCall().init)["CH-Organization-Id"]).toBe(
        CH_ORG_ID,
      );

      onChb(
        jsonResponse(200, {
          url: "https://pay.example.com/c/1",
          organizationId: CH_ORG_ID,
        }),
      );
      await client().createCheckoutSession({
        email: "user@example.com",
        planCode: "pro",
        returnUrl: "https://cloud.langfuse.com/back",
      });
      // Checkout creates the CH organization, so there is none to scope to yet.
      expect(
        headersOf(lastChbCall().init)["CH-Organization-Id"],
      ).toBeUndefined();
    });

    it("sets content-type only when there is a body", async () => {
      onChb(jsonResponse(202, {}));
      await client().setScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
        change: {
          type: "downgrade",
          when: "billing_cycle_end",
          planCode: "core",
        },
      });
      const withBody = lastChbCall();
      expect(headersOf(withBody.init)["content-type"]).toBe("application/json");
      expect(JSON.parse(withBody.init.body as string)).toEqual({
        type: "downgrade",
        when: "billing_cycle_end",
        planCode: "core",
      });

      onChb(jsonResponse(202, {}));
      await client().clearScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
      });
      const withoutBody = lastChbCall();
      expect(withoutBody.init.method).toBe("DELETE");
      expect(withoutBody.init.body).toBeUndefined();
      expect(headersOf(withoutBody.init)["content-type"]).toBeUndefined();
    });

    it("forwards an idempotency key as a header, and omits it when absent", async () => {
      onChb(jsonResponse(202, {}));
      await client().setScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
        change: { type: "cancel", when: "billing_cycle_end" },
        idempotencyKey: "chb.bundle.scheduled.set:bundleId=bundle_1:op=abc",
      });
      expect(headersOf(lastChbCall().init)["Idempotency-Key"]).toBe(
        "chb.bundle.scheduled.set:bundleId=bundle_1:op=abc",
      );

      onChb(jsonResponse(202, {}));
      await client().setScheduledChange({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
        change: { type: "cancel", when: "billing_cycle_end" },
      });
      expect(headersOf(lastChbCall().init)["Idempotency-Key"]).toBeUndefined();
    });
  });

  describe("error mapping", () => {
    it("maps 409 to ChbPaymentRequiredError", async () => {
      onChb(jsonResponse(409, { error: "no_payment_method" }));

      const error = await client()
        .setScheduledChange({
          chOrganizationId: CH_ORG_ID,
          bundleId: "bundle_1",
          change: { type: "upgrade", when: "immediate", planCode: "team" },
        })
        .catch((e) => e);

      // Callers branch on the subclass, so both the class and the 409 status
      // are part of the contract.
      expect(error).toBeInstanceOf(ChbPaymentRequiredError);
      expect(error).toBeInstanceOf(ChbApiError);
      expect(error.status).toBe(409);
      expect(error.body).toEqual({ error: "no_payment_method" });
      // A 409 is an expected UX branch, not an incident.
      expect(mocks.logger.error).not.toHaveBeenCalled();
    });

    it("maps any other non-2xx to ChbApiError and logs it", async () => {
      onChb(jsonResponse(503, { error: "unavailable" }));

      const error = await client()
        .getBundle({ chOrganizationId: CH_ORG_ID, bundleId: "bundle_1" })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ChbApiError);
      expect(error).not.toBeInstanceOf(ChbPaymentRequiredError);
      expect(error.status).toBe(503);
      expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    });

    it("does not fail on a non-2xx with an unparsable body", async () => {
      onChb({
        status: 502,
        ok: false,
        json: async () => {
          throw new Error("not json");
        },
      });

      const error = await client()
        .getBundle({ chOrganizationId: CH_ORG_ID, bundleId: "bundle_1" })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ChbApiError);
      expect(error.status).toBe(502);
      expect(error.body).toBeUndefined();
    });
  });

  describe("response parsing", () => {
    it("ignores unknown fields so additive CHB changes cannot break us", async () => {
      onChb(
        jsonResponse(200, {
          id: "bundle_1",
          plan: { planCode: "team", tierName: "Team", extra: true },
          period: { startDate: "2026-08-01T00:00:00Z" },
          payment: { status: "active", provider: { customerId: "cus_1" } },
          unknownTopLevel: { nested: 1 },
        }),
      );

      const bundle = await client().getBundle({
        chOrganizationId: CH_ORG_ID,
        bundleId: "bundle_1",
      });

      expect(bundle.id).toBe("bundle_1");
      expect(bundle.plan?.planCode).toBe("team");
      expect(bundle.payment?.provider?.customerId).toBe("cus_1");
      // Nothing required beyond `id`, so a sparse bundle still parses.
      expect(bundle.scheduled).toBeUndefined();
    });

    it("defaults the invoice list to empty when CHB omits the key", async () => {
      onChb(jsonResponse(200, {}));

      await expect(
        client().listInvoices({
          chOrganizationId: CH_ORG_ID,
          bundleId: "bundle_1",
        }),
      ).resolves.toEqual([]);
    });

    it("rejects a checkout session without a uuid organization id", async () => {
      // The id is persisted into cloudConfig, where the stored schema demands a
      // uuid — rejecting here keeps a bad id from ever reaching the database.
      onChb(
        jsonResponse(200, {
          url: "https://pay.example.com/c/1",
          organizationId: "not-a-uuid",
        }),
      );

      await expect(
        client().createCheckoutSession({
          email: "user@example.com",
          planCode: "pro",
          returnUrl: "https://cloud.langfuse.com/back",
        }),
      ).rejects.toThrow();
    });
  });

  describe("createChbApiClientFromEnv", () => {
    const setAll = () => {
      mocks.env.CLICKHOUSE_BILLING_BASE_URL = "https://chb.example.com";
      mocks.env.CLICKHOUSE_BILLING_AUTH0_DOMAIN = AUTH0_DOMAIN;
      mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID = "client-id";
      mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET = "client-secret";
    };

    it.each([
      "CLICKHOUSE_BILLING_BASE_URL",
      "CLICKHOUSE_BILLING_AUTH0_DOMAIN",
      "CLICKHOUSE_BILLING_AUTH0_CLIENT_ID",
      "CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET",
    ] as const)("returns null when %s is missing", (missing) => {
      setAll();
      mocks.env[missing] = undefined;
      // Fail closed: a partly configured deployment must not call CHB at all.
      expect(createChbApiClientFromEnv()).toBeNull();
    });

    it("builds a client once every credential is present", () => {
      setAll();
      expect(createChbApiClientFromEnv()).toBeInstanceOf(ChbApiClient);
    });
  });
});
