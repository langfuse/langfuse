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
  createDefaultSpendAlertsForPlan: vi.fn(),
  sendChbProjectEvent: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: { findFirst: mocks.findOrg, update: mocks.updateOrg },
    project: { findMany: mocks.findProjects },
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

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: mocks.auditLog,
}));

vi.mock("@/src/ee/features/billing/server/stripe/stripeWebhookHandler", () => ({
  createDefaultSpendAlertsForPlan: mocks.createDefaultSpendAlertsForPlan,
}));

vi.mock("@/src/ee/features/billing/server/chb/chbProjectEvents", () => ({
  sendChbProjectEvent: mocks.sendChbProjectEvent,
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

const sign = (rawBody: string, timestamp: string, secret: string = SECRET) =>
  crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

describe("verifyChbSignature", () => {
  const nowMs = 1_753_200_000_000; // fixed reference time
  const timestamp = String(Math.floor(nowMs / 1000));
  const rawBody = JSON.stringify({ id: "evt_1", type: "bundle.created" });

  it("accepts a valid signature within the skew window", () => {
    const result = verifyChbSignature({
      rawBody,
      signature: sign(rawBody, timestamp),
      timestamp,
      secret: SECRET,
      nowMs,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects a tampered body", () => {
    const result = verifyChbSignature({
      rawBody: rawBody + "tampered",
      signature: sign(rawBody, timestamp),
      timestamp,
      secret: SECRET,
      nowMs,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature mismatch");
  });

  it("rejects a signature made with the wrong secret", () => {
    const result = verifyChbSignature({
      rawBody,
      signature: sign(rawBody, timestamp, "other-secret"),
      timestamp,
      secret: SECRET,
      nowMs,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature mismatch");
  });

  it("rejects a timestamp outside the 5 minute skew window", () => {
    const staleTimestamp = String(Math.floor(nowMs / 1000) - 6 * 60);
    const result = verifyChbSignature({
      rawBody,
      signature: sign(rawBody, staleTimestamp),
      timestamp: staleTimestamp,
      secret: SECRET,
      nowMs,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp outside allowed clock skew");
  });

  it("rejects a signed timestamp different from the header timestamp", () => {
    const result = verifyChbSignature({
      rawBody,
      signature: sign(rawBody, String(Math.floor(nowMs / 1000) - 30)),
      timestamp,
      secret: SECRET,
      nowMs,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature mismatch");
  });

  it.each([
    ["missing signature", null, timestamp],
    ["missing timestamp", sign(rawBody, timestamp), null],
  ])("rejects %s", (_label, signature, ts) => {
    const result = verifyChbSignature({
      rawBody,
      signature,
      timestamp: ts,
      secret: SECRET,
      nowMs,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed timestamp", () => {
    const result = verifyChbSignature({
      rawBody,
      signature: sign(rawBody, "not-a-number"),
      timestamp: "not-a-number",
      secret: SECRET,
      nowMs,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("malformed timestamp");
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
      headers: {
        "chb-signature": sign(rawBody, timestamp),
        "chb-timestamp": timestamp,
      },
    });
  };

  const bundleCreated = (payment?: Record<string, unknown>) => ({
    id: "evt_1",
    type: "bundle.created",
    createdAt: "2026-07-01T00:00:00Z",
    organizationId: CHB_ORG_ID,
    data: {
      bundleId: "bundle_1",
      planCode: "pro",
      startDate: "2026-07-01T00:00:00Z",
      ...(payment ? { payment } : {}),
    },
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
    mocks.createDefaultSpendAlertsForPlan.mockResolvedValue(undefined);
  });

  const orgColumnsOfUpdate = () =>
    mocks.updateOrg.mock.calls[0]?.[0]?.data ?? {};

  it("un-suspends on bundle.created only once payment is active", async () => {
    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    expect(response.status).toBe(200);
    expect(orgColumnsOfUpdate()).toMatchObject({
      cloudFreeTierUsageThresholdState: null,
    });
  });

  it.each([
    ["a pending initial payment", { status: "pending" }],
    ["no payment block at all", undefined],
  ])(
    "leaves the free-tier suspension in place on bundle.created with %s",
    async (_label, payment) => {
      // A failed or pending first payment must not un-block ingestion for an org
      // suspended at the free-tier limit; bundle.updated lifts it when the
      // payment goes active.
      const response = await chbWebhookHandler(post(bundleCreated(payment)));

      expect(response.status).toBe(200);
      expect(orgColumnsOfUpdate()).not.toHaveProperty(
        "cloudFreeTierUsageThresholdState",
      );
      // The bundle itself is still recorded, anchor included.
      expect(orgColumnsOfUpdate()).toHaveProperty("cloudBillingCycleAnchor");
    },
  );

  it("releases the dedupe claim when applying the event fails", async () => {
    mocks.updateOrg.mockRejectedValue(new Error("could not serialize access"));

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    // Without the release, CHB's retry hits the claim this request took and is
    // dropped as a duplicate — the event is lost for the whole 24h TTL.
    expect(response.status).toBe(500);
    expect(mocks.redisDel).toHaveBeenCalledWith("chb-webhook-event:evt_1");
    expect(await response.json()).toEqual({
      message: "Failed to apply webhook event",
    });
  });

  it("keeps the dedupe claim when the event applied cleanly", async () => {
    await chbWebhookHandler(post(bundleCreated({ status: "active" })));

    expect(mocks.redisDel).not.toHaveBeenCalled();
  });

  it("refuses to apply CHB state onto an org with a live Stripe subscription", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow(
        { organizationId: CHB_ORG_ID },
        { customerId: "cus_1", activeSubscriptionId: "sub_1" },
      ),
    );

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    // Double-billed org: applying more CHB state would bury the contradiction.
    expect(response.status).toBe(200);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalled();
  });

  it("skips an event whose id was already claimed", async () => {
    mocks.redisSet.mockResolvedValue(null);

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    expect(response.status).toBe(200);
    expect(mocks.findOrg).not.toHaveBeenCalled();
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("ignores an org that belongs to another region", async () => {
    mocks.findOrg.mockResolvedValue(null);

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });
});
