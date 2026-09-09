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
  buildChbApiClientFromEnv,
  ChbApiClient,
  ChbApiError,
  ChbPaymentRequiredError,
  getChbApiClient,
  resetChbApiClientForTests,
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
      onChb(jsonResponse(200, { portalUrl: "https://pay.example.com/s/1" }));

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
      onChb(jsonResponse(200, { id: "plan_1" }), jsonResponse(200, {}));
      const chb = client();

      await chb.getAttachedPlan({ chOrganizationId: CH_ORG_ID });
      await chb.clearScheduledChange({
        chOrganizationId: CH_ORG_ID,
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
        change: { type: "cancel", when: "billing_cycle_end" },
        idempotencyKey:
          "chb.attachedplan.scheduled.set:attachedPlanId=b1:op=abc",
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
        "chb.attachedplan.scheduled.set:attachedPlanId=b1:op=abc",
      );
    });

    it("surfaces a 401 that survives the replay", async () => {
      onChb(jsonResponse(401, {}), jsonResponse(401, {}));

      const error = await client()
        .getAttachedPlan({ chOrganizationId: CH_ORG_ID })
        .catch((e) => e);

      // One replay, not a loop.
      expect(chbCalls()).toHaveLength(2);
      expect(error).toBeInstanceOf(ChbApiError);
      expect(error.status).toBe(401);
    });
  });

  describe("request wiring", () => {
    it("keeps the base url path prefix when joining the request path", async () => {
      onChb(jsonResponse(200, { id: "plan_1" }));

      await client().getAttachedPlan({ chOrganizationId: CH_ORG_ID });

      expect(lastChbCall().url.toString()).toBe(
        "https://chb.example.com/api/v1/attachedplan?fields=plan%2Cperiod%2Cpayment%2Cscheduled",
      );
    });

    it("scopes the scheduled-change routes by header, with no id in the path", async () => {
      onChb(jsonResponse(200, {}));

      await client().clearScheduledChange({ chOrganizationId: CH_ORG_ID });

      // CHB resolves the attached plan from the organization header, so the
      // path carries nothing caller-supplied.
      const { url, init } = lastChbCall();
      expect(url.pathname).toBe("/api/v1/attachedplan/scheduled");
      expect(headersOf(init)["CH-Organization-Id"]).toBe(CH_ORG_ID);
    });

    it("scopes the invoice list by an organizationId query parameter", async () => {
      onChb(jsonResponse(200, { invoices: [] }));

      await client().listInvoices({ chOrganizationId: CH_ORG_ID });

      const { url } = lastChbCall();
      expect(url.pathname).toBe("/api/v1/invoices");
      expect(url.searchParams.get("organizationId")).toBe(CH_ORG_ID);
    });

    it("always sends a checkout idempotency key, generating one when the caller has none", async () => {
      const session = {
        checkoutUrl: "https://pay.example.com/c/1",
        organizationId: CH_ORG_ID,
      };
      const checkout = (idempotencyKey?: string) =>
        client().createCheckoutSession({
          email: "user@example.com",
          planCode: "LANGFUSE_PRO",
          returnUrl: "https://cloud.langfuse.com/back",
          idempotencyKey,
        });

      onChb(jsonResponse(200, session));
      await checkout("chb.checkout.create:orgId=org-1:op=abc");
      expect(JSON.parse(lastChbCall().init.body as string).idempotencyKey).toBe(
        "chb.checkout.create:orgId=org-1:op=abc",
      );

      // CHB rejects a checkout without a key; a generated one keeps the call
      // valid and merely gives up deduplication.
      onChb(jsonResponse(200, session));
      await checkout(undefined);
      const generated = JSON.parse(lastChbCall().init.body as string)
        .idempotencyKey as string;
      expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("scopes org endpoints with CH-Organization-Id and omits it elsewhere", async () => {
      onChb(jsonResponse(200, { id: "plan_1" }));
      await client().getAttachedPlan({ chOrganizationId: CH_ORG_ID });
      expect(headersOf(lastChbCall().init)["CH-Organization-Id"]).toBe(
        CH_ORG_ID,
      );

      onChb(
        jsonResponse(200, {
          checkoutUrl: "https://pay.example.com/c/1",
          organizationId: CH_ORG_ID,
        }),
      );
      await client().createCheckoutSession({
        email: "user@example.com",
        planCode: "LANGFUSE_PRO",
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
        change: {
          type: "downgrade",
          when: "billing_cycle_end",
          planCode: "LANGFUSE_CORE",
        },
      });
      const withBody = lastChbCall();
      expect(headersOf(withBody.init)["content-type"]).toBe("application/json");
      expect(JSON.parse(withBody.init.body as string)).toEqual({
        type: "downgrade",
        when: "billing_cycle_end",
        planCode: "LANGFUSE_CORE",
      });

      onChb(jsonResponse(202, {}));
      await client().clearScheduledChange({
        chOrganizationId: CH_ORG_ID,
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
        change: { type: "cancel", when: "billing_cycle_end" },
        idempotencyKey:
          "chb.attachedplan.scheduled.set:attachedPlanId=plan_1:op=abc",
      });
      expect(headersOf(lastChbCall().init)["Idempotency-Key"]).toBe(
        "chb.attachedplan.scheduled.set:attachedPlanId=plan_1:op=abc",
      );

      onChb(jsonResponse(202, {}));
      await client().setScheduledChange({
        chOrganizationId: CH_ORG_ID,
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
          change: {
            type: "upgrade",
            when: "immediate",
            planCode: "LANGFUSE_PRO_TEAMS",
          },
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
        .getAttachedPlan({ chOrganizationId: CH_ORG_ID })
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
        .getAttachedPlan({ chOrganizationId: CH_ORG_ID })
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
          id: "plan_1",
          plan: {
            code: "LANGFUSE_PRO_TEAMS",
            amount: 199,
            currency: "USD",
            recurrence: "monthly",
            extra: true,
          },
          period: { startDate: "2026-08-01T00:00:00Z" },
          payment: {
            status: "active",
            provider: { name: "stripe", customerId: "cus_1" },
          },
          unknownTopLevel: { nested: 1 },
        }),
      );

      const attachedPlan = await client().getAttachedPlan({
        chOrganizationId: CH_ORG_ID,
      });

      expect(attachedPlan.id).toBe("plan_1");
      expect(attachedPlan.plan?.code).toBe("LANGFUSE_PRO_TEAMS");
      expect(attachedPlan.payment?.provider?.customerId).toBe("cus_1");
      // Nothing required beyond `id`, so a sparse attached plan still parses.
      expect(attachedPlan.scheduled).toBeUndefined();
    });

    it("reads the portal URL from CHB's portalUrl field", async () => {
      onChb(jsonResponse(200, { portalUrl: "https://pay.example.com/s/1" }));

      await expect(
        client().createPortalSession({
          chOrganizationId: CH_ORG_ID,
          returnUrl: "https://cloud.langfuse.com/back",
        }),
      ).resolves.toBe("https://pay.example.com/s/1");
    });

    it("reads the checkout URL from CHB's checkoutUrl field", async () => {
      onChb(
        jsonResponse(200, {
          organizationId: CH_ORG_ID,
          checkoutUrl: "https://pay.example.com/c/1",
        }),
      );

      await expect(
        client().createCheckoutSession({
          email: "user@example.com",
          planCode: "LANGFUSE_PRO",
          returnUrl: "https://cloud.langfuse.com/back",
        }),
      ).resolves.toEqual({
        organizationId: CH_ORG_ID,
        checkoutUrl: "https://pay.example.com/c/1",
      });
    });

    it("defaults the invoice list to empty when CHB omits the key", async () => {
      onChb(jsonResponse(200, {}));

      await expect(
        client().listInvoices({
          chOrganizationId: CH_ORG_ID,
        }),
      ).resolves.toEqual([]);
    });

    it("rejects a checkout session without a uuid organization id", async () => {
      // The id is persisted into cloudConfig, where the stored schema demands a
      // uuid — rejecting here keeps a bad id from ever reaching the database.
      onChb(
        jsonResponse(200, {
          checkoutUrl: "https://pay.example.com/c/1",
          organizationId: "not-a-uuid",
        }),
      );

      await expect(
        client().createCheckoutSession({
          email: "user@example.com",
          planCode: "LANGFUSE_PRO",
          returnUrl: "https://cloud.langfuse.com/back",
        }),
      ).rejects.toThrow();
    });
  });

  describe("buildChbApiClientFromEnv", () => {
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
      expect(buildChbApiClientFromEnv()).toBeNull();
    });

    it("builds a client once every credential is present", () => {
      setAll();
      expect(buildChbApiClientFromEnv()).toBeInstanceOf(ChbApiClient);
    });
  });

  describe("getChbApiClient", () => {
    const setAll = () => {
      mocks.env.CLICKHOUSE_BILLING_BASE_URL = "https://chb.example.com";
      mocks.env.CLICKHOUSE_BILLING_AUTH0_DOMAIN = AUTH0_DOMAIN;
      mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_ID = "client-id";
      mocks.env.CLICKHOUSE_BILLING_AUTH0_CLIENT_SECRET = "client-secret";
    };

    beforeEach(() => resetChbApiClientForTests());
    afterEach(() => resetChbApiClientForTests());

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
      onChb(jsonResponse(200, { portalUrl: "https://chb.example.com/portal" }));
      onChb(jsonResponse(200, { portalUrl: "https://chb.example.com/portal" }));

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
});
