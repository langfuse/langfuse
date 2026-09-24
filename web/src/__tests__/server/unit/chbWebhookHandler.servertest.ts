import crypto from "crypto";

import { NextRequest } from "next/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "eu" as string | undefined,
    CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET: "test-signing-secret" as
      | string
      | undefined,
  },
  findOrg: vi.fn(),
  updateOrg: vi.fn(),
  findProjects: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  invalidateCachedOrgApiKeys: vi.fn(),
  traceException: vi.fn(),
  recordIncrement: vi.fn(),
  auditLog: vi.fn(),
  findSpendAlert: vi.fn(),
  createSpendAlert: vi.fn(),
  sendChbProjectEvent: vi.fn(),
  getChbApiClient: vi.fn(),
  getAttachedPlan: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: { findFirst: mocks.findOrg, update: mocks.updateOrg },
    project: { findMany: mocks.findProjects },
    cloudSpendAlert: {
      findFirst: mocks.findSpendAlert,
      create: mocks.createSpendAlert,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    // status "end" keeps the shared teardown hook from trying to disconnect
    // this stand-in.
    redis: { set: mocks.redisSet, del: mocks.redisDel, status: "end" },
    invalidateCachedOrgApiKeys: mocks.invalidateCachedOrgApiKeys,
    traceException: mocks.traceException,
    recordIncrement: mocks.recordIncrement,
  };
});

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: mocks.auditLog,
}));

vi.mock("@/src/ee/features/billing/server/chb/chbProjectEvents", () => ({
  sendChbProjectEvent: mocks.sendChbProjectEvent,
}));

vi.mock("@/src/ee/features/billing/server/chb/chbApiClient", () => ({
  getChbApiClient: mocks.getChbApiClient,
}));

import {
  chbWebhookHandler,
  verifyChbSignature,
} from "@/src/ee/features/billing/server/chb/chbWebhookHandler";
import { logger } from "@langfuse/shared/src/server";

vi.spyOn(logger, "error").mockImplementation((() => {}) as never);
vi.spyOn(logger, "warn").mockImplementation((() => {}) as never);
vi.spyOn(logger, "info").mockImplementation((() => {}) as never);

const SECRET = "test-signing-secret";

const hmacHex = (rawBody: string, timestamp: string, secret: string = SECRET) =>
  crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

/** `X-CHB-Signature` as the control-plane dispatcher emits it: `t=` first, then
 * one `v1=` per signing key it currently holds (two during a rotation). */
const signatureHeader = (
  rawBody: string,
  timestamp: string,
  secrets: string[] = [SECRET],
) =>
  [
    `t=${timestamp}`,
    ...secrets.map((secret) => `v1=${hmacHex(rawBody, timestamp, secret)}`),
  ].join(",");

describe("verifyChbSignature", () => {
  const nowMs = 1_753_200_000_000; // fixed reference time
  const timestamp = String(Math.floor(nowMs / 1000));
  const rawBody = JSON.stringify({
    eventId: "evt_1",
    type: "BILLING_ATTACHEDPLAN_CREATED",
  });

  const verify = (header: string | null, body: string = rawBody) =>
    verifyChbSignature({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
      nowMs,
    });

  it("accepts a valid signature within the skew window", () => {
    expect(verify(signatureHeader(rawBody, timestamp))).toEqual({
      valid: true,
    });
  });

  it("accepts the request when any v1 signature matches during a key rotation", () => {
    // The dispatcher signs with every key it holds; we hold only one of them.
    expect(
      verify(signatureHeader(rawBody, timestamp, ["retired-secret", SECRET])),
    ).toEqual({ valid: true });
    expect(
      verify(signatureHeader(rawBody, timestamp, [SECRET, "next-secret"])),
    ).toEqual({ valid: true });
  });

  it("rejects when none of several v1 signatures matches", () => {
    const result = verify(
      signatureHeader(rawBody, timestamp, ["retired-secret", "next-secret"]),
    );
    expect(result).toEqual({ valid: false, reason: "signature mismatch" });
  });

  it("rejects a tampered body", () => {
    const result = verify(
      signatureHeader(rawBody, timestamp),
      rawBody + "tampered",
    );
    expect(result).toEqual({ valid: false, reason: "signature mismatch" });
  });

  it("rejects a signature made with the wrong secret", () => {
    const result = verify(
      signatureHeader(rawBody, timestamp, ["other-secret"]),
    );
    expect(result).toEqual({ valid: false, reason: "signature mismatch" });
  });

  it("rejects a timestamp outside the 5 minute skew window", () => {
    const stale = String(Math.floor(nowMs / 1000) - 6 * 60);
    const result = verify(signatureHeader(rawBody, stale));
    expect(result).toEqual({
      valid: false,
      reason: "timestamp outside allowed clock skew",
    });
  });

  it("rejects a signature computed over a different timestamp than the header carries", () => {
    const signedOver = String(Math.floor(nowMs / 1000) - 30);
    const header = `t=${timestamp},v1=${hmacHex(rawBody, signedOver)}`;
    expect(verify(header)).toEqual({
      valid: false,
      reason: "signature mismatch",
    });
  });

  it("rejects a missing header", () => {
    expect(verify(null)).toEqual({
      valid: false,
      reason: "missing signature header",
    });
  });

  it.each([
    ["no t= element", `v1=${hmacHex(rawBody, timestamp)}`],
    ["no v1= element", `t=${timestamp}`],
    ["a bare signature", hmacHex(rawBody, timestamp)],
    ["an empty value", ""],
  ])("rejects a header with %s", (_label, header) => {
    expect(verify(header)).toEqual({
      valid: false,
      reason: "malformed signature header",
    });
  });

  it("rejects a malformed timestamp", () => {
    const result = verify(signatureHeader(rawBody, "not-a-number"));
    expect(result).toEqual({ valid: false, reason: "malformed timestamp" });
  });
});

describe("chbWebhookHandler", () => {
  const CHB_ORG_ID = "3f7c1b0a-2d5e-4c8b-9a1f-8e6d4c2b1a09";
  const ORG_ID = "org-1";

  const orgRow = (clickhouse: Record<string, unknown>, stripe?: unknown) => ({
    id: ORG_ID,
    name: "Org",
    cloudConfig: { clickhouse, ...(stripe ? { stripe } : {}) },
  });

  const post = (event: Record<string, unknown>) => {
    const rawBody = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return new NextRequest("http://localhost/api/billing/clickhouse-webhook", {
      method: "POST",
      body: rawBody,
      headers: { "x-chb-signature": signatureHeader(rawBody, timestamp) },
    });
  };

  // The body as the control-plane dispatcher delivers it: `data` is the
  // billing-api event bus record, and the organization lives in its payload.
  const attachedPlanCreated = (payload: Record<string, unknown> = {}) => ({
    eventId: "evt_1",
    type: "BILLING_ATTACHEDPLAN_CREATED",
    occurredAt: "2026-07-01T00:00:00Z",
    data: {
      id: "0de85656-bdc7-47e3-a656-a2ae2ec91b41",
      source: "billing-api",
      timestamp: 1_782_000_001_000,
      version: 1,
      payload: {
        createdAt: 1_782_000_000_000,
        eventType: "BILLING_ATTACHEDPLAN_CREATED",
        organizationId: CHB_ORG_ID,
        planCode: "LANGFUSE_CORE",
        ...payload,
      },
    },
  });

  // Any other attached-plan event: same envelope, different type.
  const chbEvent = (type: string, overrides: Record<string, unknown> = {}) => ({
    ...attachedPlanCreated({ eventType: type }),
    type,
    ...overrides,
  });

  // GET /attachedplan as CHB answers it for the org named in the event.
  const attachedPlan = (overrides: Record<string, unknown> = {}) => ({
    id: "plan_1",
    plan: { code: "LANGFUSE_CORE" },
    period: {
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2026-08-01T00:00:00Z",
    },
    payment: {
      status: "active",
      provider: { name: "stripe", customerId: "cus_1" },
    },
    scheduled: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "eu";
    mocks.env.CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET = SECRET;
    mocks.findOrg.mockResolvedValue(orgRow({ organizationId: CHB_ORG_ID }));
    mocks.updateOrg.mockResolvedValue({});
    mocks.findProjects.mockResolvedValue([]);
    // ioredis SET NX returns "OK" on a fresh key, null when the key existed.
    mocks.redisSet.mockResolvedValue("OK");
    mocks.redisDel.mockResolvedValue(1);
    mocks.sendChbProjectEvent.mockResolvedValue(undefined);
    // clearAllMocks keeps mockRejectedValue implementations, so every mock a
    // test rejects has to be pinned back here or it leaks into the next test.
    mocks.invalidateCachedOrgApiKeys.mockResolvedValue(undefined);
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.findSpendAlert.mockResolvedValue(null);
    mocks.createSpendAlert.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `alert-${data.threshold}`,
        ...data,
      }),
    );
    mocks.getChbApiClient.mockReturnValue({
      getAttachedPlan: mocks.getAttachedPlan,
    });
    mocks.getAttachedPlan.mockResolvedValue(attachedPlan());
  });

  const orgColumnsOfUpdate = () =>
    mocks.updateOrg.mock.calls[0]?.[0]?.data ?? {};

  it("un-suspends on BILLING_ATTACHEDPLAN_CREATED only once payment is active", async () => {
    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    expect(response.status).toBe(200);
    expect(orgColumnsOfUpdate()).toMatchObject({
      cloudFreeTierUsageThresholdState: null,
    });
  });

  it.each([
    ["a pending initial payment", { status: "pending" }],
    ["no payment block at all", null],
  ])(
    "leaves the free-tier suspension in place on BILLING_ATTACHEDPLAN_CREATED with %s",
    async (_label, payment) => {
      // A failed or pending first payment must not un-block ingestion for an org
      // suspended at the free-tier limit.
      mocks.getAttachedPlan.mockResolvedValue(attachedPlan({ payment }));

      const response = await chbWebhookHandler(post(attachedPlanCreated()));

      expect(response.status).toBe(200);
      expect(orgColumnsOfUpdate()).not.toHaveProperty(
        "cloudFreeTierUsageThresholdState",
      );
      // The plan itself is still recorded, anchor included.
      expect(orgColumnsOfUpdate()).toHaveProperty("cloudBillingCycleAnchor");
    },
  );

  it("releases the dedupe claim when applying the event fails", async () => {
    mocks.updateOrg.mockRejectedValue(new Error("could not serialize access"));

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    // Without the release, CHB's retry hits the claim this request took and is
    // dropped as a duplicate — the event is lost for the whole 24h TTL.
    expect(response.status).toBe(500);
    expect(mocks.redisDel).toHaveBeenCalledWith("chb-webhook-event:evt_1");
    expect(await response.json()).toEqual({
      message: "Failed to apply webhook event",
    });
  });

  it("keeps the dedupe claim when the event applied cleanly", async () => {
    await chbWebhookHandler(post(attachedPlanCreated()));

    expect(mocks.redisDel).not.toHaveBeenCalled();
  });

  it("refuses to apply CHB state onto an org with a live Stripe subscription", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow(
        { organizationId: CHB_ORG_ID },
        { customerId: "cus_1", activeSubscriptionId: "sub_1" },
      ),
    );

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    // Double-billed org: applying more CHB state would bury the contradiction.
    expect(response.status).toBe(200);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalled();
  });

  it("skips an event whose id was already claimed", async () => {
    mocks.redisSet.mockResolvedValue(null);

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    expect(response.status).toBe(200);
    expect(mocks.findOrg).not.toHaveBeenCalled();
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("ignores an org that belongs to another region", async () => {
    mocks.findOrg.mockResolvedValue(null);

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    expect(response.status).toBe(200);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("rejects a request without the signature header", async () => {
    const response = await chbWebhookHandler(
      new NextRequest("http://localhost/api/billing/clickhouse-webhook", {
        method: "POST",
        body: JSON.stringify(attachedPlanCreated()),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Webhook error: missing signature header",
    });
    // Nothing downstream runs on an unverified body, not even the dedupe claim.
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it("rejects an envelope without data.payload.organizationId", async () => {
    const response = await chbWebhookHandler(
      post(attachedPlanCreated({ organizationId: undefined })),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Webhook error: invalid payload",
    });
    expect(mocks.findOrg).not.toHaveBeenCalled();
  });

  it("reads the attached plan back from CHB and persists it with the event's organization and occurredAt", async () => {
    await chbWebhookHandler(post(attachedPlanCreated()));

    // The event names the organization but not the plan; the plan id and code
    // come from GET /attachedplan for that organization.
    expect(mocks.getAttachedPlan).toHaveBeenCalledWith({
      chOrganizationId: CHB_ORG_ID,
    });
    expect(orgColumnsOfUpdate().cloudConfig).toMatchObject({
      clickhouse: {
        organizationId: CHB_ORG_ID,
        attachedPlanId: "plan_1",
        planCode: "LANGFUSE_CORE",
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      },
    });
    expect(orgColumnsOfUpdate().cloudBillingCycleAnchor).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
  });

  it("keeps the event retryable when the attached plan cannot be read", async () => {
    mocks.getAttachedPlan.mockRejectedValue(
      new Error("CHB API GET attachedplan failed with status 404"),
    );

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    // Nothing was persisted, so the claim has to go back for CHB's retry to
    // reach the read again once the plan is there.
    expect(response.status).toBe(500);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.redisDel).toHaveBeenCalledWith("chb-webhook-event:evt_1");
  });

  it("drops an event that occurred at or before the last applied one", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({
        organizationId: CHB_ORG_ID,
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      }),
    );

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    expect(response.status).toBe(200);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("keeps a failed project backfill out of the retry path", async () => {
    mocks.findProjects.mockRejectedValue(new Error("connection reset"));

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    // The plan is already persisted, so the ordering guard would drop a
    // retry as already applied; a 500 here only asks CHB for a retry that can
    // never reach the backfill. Log and page instead.
    expect(response.status).toBe(200);
    expect(mocks.updateOrg).toHaveBeenCalledTimes(1);
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalled();
  });

  it("keeps a failed API-key cache invalidation out of the retry path", async () => {
    mocks.invalidateCachedOrgApiKeys.mockRejectedValue(
      new Error("connection reset"),
    );

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    // Same commit-point rule; the stale cache entry expires with its TTL.
    expect(response.status).toBe(200);
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalled();
  });

  it("keeps a failed audit log write out of the retry path", async () => {
    mocks.auditLog.mockRejectedValue(new Error("connection reset"));

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    // Post-commit like the cache invalidation: the state change is applied,
    // so the missing audit row is logged and paged rather than retried.
    expect(response.status).toBe(200);
    // The organization row's audit write is the one that must have been
    // attempted; a created event also audits each seeded spend alert, so the
    // action is the assertion rather than a call count.
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BillingService.chb.BILLING_ATTACHEDPLAN_CREATED",
      }),
    );
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection reset" }),
    );
  });

  it("maps the attached plan's payment, period end and provider customer onto the stored block", async () => {
    await chbWebhookHandler(post(attachedPlanCreated()));

    expect(orgColumnsOfUpdate().cloudConfig).toMatchObject({
      clickhouse: {
        paymentStatus: "active",
        nextPaymentDate: "2026-08-01T00:00:00Z",
        stripeCustomerId: "cus_1",
      },
    });
  });

  it("refuses an unknown plan code on the event and keeps it retryable", async () => {
    const response = await chbWebhookHandler(
      post(attachedPlanCreated({ planCode: "LANGFUSE_ULTRA" })),
    );

    // Storing the code would null the plan and drop a paying org to hobby.
    // The 500 keeps the event in the dispatcher's retry budget until the
    // mapping ships, so the dedupe claim has to go back.
    expect(response.status).toBe(500);
    expect(mocks.getAttachedPlan).not.toHaveBeenCalled();
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.redisDel).toHaveBeenCalledWith("chb-webhook-event:evt_1");
    expect(mocks.traceException).toHaveBeenCalled();
  });

  it("refuses an unknown plan code reported by GET /attachedplan the same way", async () => {
    mocks.getAttachedPlan.mockResolvedValue(
      attachedPlan({ plan: { code: "LANGFUSE_ULTRA" } }),
    );

    const response = await chbWebhookHandler(post(attachedPlanCreated()));

    expect(response.status).toBe(500);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.redisDel).toHaveBeenCalledWith("chb-webhook-event:evt_1");
  });

  it("rejects an event type outside the CHB enum", async () => {
    const response = await chbWebhookHandler(
      post(chbEvent("BILLING_ATTACHEDPLAN_DELETED")),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Webhook error: invalid payload",
    });
    expect(mocks.findOrg).not.toHaveBeenCalled();
  });

  it("re-reads the plan on BILLING_ATTACHEDPLAN_UPDATED and overwrites the snapshot without moving the billing cycle anchor", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({
        organizationId: CHB_ORG_ID,
        attachedPlanId: "plan_1",
        planCode: "LANGFUSE_CORE",
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      }),
    );
    mocks.getAttachedPlan.mockResolvedValue(
      attachedPlan({ plan: { code: "LANGFUSE_PRO" } }),
    );

    const response = await chbWebhookHandler(
      post(
        chbEvent("BILLING_ATTACHEDPLAN_UPDATED", {
          eventId: "evt_2",
          occurredAt: "2026-07-15T00:00:00Z",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(orgColumnsOfUpdate().cloudConfig.clickhouse).toMatchObject({
      attachedPlanId: "plan_1",
      planCode: "LANGFUSE_PRO",
      lastEventCreatedAt: "2026-07-15T00:00:00Z",
    });
    expect(orgColumnsOfUpdate()).not.toHaveProperty("cloudBillingCycleAnchor");
    // Only a created plan backfills projects.
    expect(mocks.findProjects).not.toHaveBeenCalled();
  });

  it("snapshots the pending change on BILLING_ATTACHEDPLAN_SCHEDULED and leaves the plan itself alone", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({
        organizationId: CHB_ORG_ID,
        attachedPlanId: "plan_1",
        planCode: "LANGFUSE_PRO",
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      }),
    );
    const scheduled = {
      type: "downgrade",
      planCode: "LANGFUSE_CORE",
      startDate: "2026-08-01T00:00:00Z",
    };
    mocks.getAttachedPlan.mockResolvedValue(
      attachedPlan({ plan: { code: "LANGFUSE_PRO" }, scheduled }),
    );

    const response = await chbWebhookHandler(
      post(
        chbEvent("BILLING_ATTACHEDPLAN_SCHEDULED", {
          eventId: "evt_4",
          occurredAt: "2026-07-20T00:00:00Z",
        }),
      ),
    );

    expect(response.status).toBe(200);
    // The plan flips when the terminal updated/cancelled event lands, not here;
    // CHB's REST view wins over the plan code the event announced.
    expect(orgColumnsOfUpdate().cloudConfig.clickhouse).toMatchObject({
      planCode: "LANGFUSE_PRO",
      scheduled,
      lastEventCreatedAt: "2026-07-20T00:00:00Z",
    });
  });

  it("drops the plan on BILLING_ATTACHEDPLAN_CANCELLED without reading it back", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({
        organizationId: CHB_ORG_ID,
        attachedPlanId: "plan_1",
        planCode: "LANGFUSE_CORE",
        paymentStatus: "active",
        stripeCustomerId: "cus_1",
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      }),
    );

    const response = await chbWebhookHandler(
      post(
        chbEvent("BILLING_ATTACHEDPLAN_CANCELLED", {
          eventId: "evt_3",
          occurredAt: "2026-08-01T00:00:00Z",
        }),
      ),
    );

    expect(response.status).toBe(200);
    // GET /attachedplan may already answer 404 for a cancelled organization.
    expect(mocks.getAttachedPlan).not.toHaveBeenCalled();
    // Only the customer identity survives; the org resolves back to hobby.
    expect(orgColumnsOfUpdate().cloudConfig.clickhouse).toEqual({
      organizationId: CHB_ORG_ID,
      stripeCustomerId: "cus_1",
      lastEventCreatedAt: "2026-08-01T00:00:00Z",
    });
    expect(orgColumnsOfUpdate()).toHaveProperty("cloudBillingCycleAnchor");
  });

  /**
   * The Stripe path seeds default spend alerts on a first subscription. A
   * CHB-billed org has to start out with the same thresholds, or its billing
   * page offers spend alerts that nobody ever configured.
   */
  describe("default spend alerts", () => {
    const seededThresholds = () =>
      mocks.createSpendAlert.mock.calls.map(
        (call) => (call[0] as { data: { threshold: number } }).data.threshold,
      );

    it("seeds the plan and universal thresholds on BILLING_ATTACHEDPLAN_CREATED", async () => {
      const response = await chbWebhookHandler(post(attachedPlanCreated()));

      expect(response.status).toBe(200);
      // LANGFUSE_CORE -> cloud:core -> $200, plus the universal $4000.
      expect(seededThresholds()).toEqual([200, 4000]);
    });

    it("seeds from the plan CHB reports, not the code the event announced", async () => {
      mocks.getAttachedPlan.mockResolvedValue(
        attachedPlan({ plan: { code: "LANGFUSE_ENTERPRISE" } }),
      );

      await chbWebhookHandler(post(attachedPlanCreated()));

      expect(seededThresholds()).toEqual([2000, 4000]);
    });

    it("leaves an org's own alerts alone", async () => {
      mocks.findSpendAlert.mockResolvedValue({ id: "existing" });

      await chbWebhookHandler(post(attachedPlanCreated()));

      expect(mocks.createSpendAlert).not.toHaveBeenCalled();
    });

    it("does not seed on an update or a cancellation", async () => {
      await chbWebhookHandler(post(chbEvent("BILLING_ATTACHEDPLAN_UPDATED")));
      await chbWebhookHandler(post(chbEvent("BILLING_ATTACHEDPLAN_CANCELLED")));

      expect(mocks.createSpendAlert).not.toHaveBeenCalled();
    });

    /**
     * Seeding runs after the organization update has committed, so a failure
     * there must not turn into a 500 that asks CHB to replay an event this
     * handler has already applied.
     */
    it("still answers 200 when seeding fails", async () => {
      mocks.createSpendAlert.mockRejectedValue(new Error("db down"));

      const response = await chbWebhookHandler(post(attachedPlanCreated()));

      expect(response.status).toBe(200);
      expect(mocks.traceException).toHaveBeenCalled();
    });
  });
});
