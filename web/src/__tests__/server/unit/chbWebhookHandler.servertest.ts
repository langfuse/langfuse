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
  const rawBody = JSON.stringify({ eventId: "evt_1", type: "bundle.created" });

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

  const bundleCreated = (payment?: Record<string, unknown>) => ({
    eventId: "evt_1",
    type: "bundle.created",
    occurredAt: "2026-07-01T00:00:00Z",
    data: {
      organizationId: CHB_ORG_ID,
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
    // clearAllMocks keeps mockRejectedValue implementations, so every mock a
    // test rejects has to be pinned back here or it leaks into the next test.
    mocks.invalidateCachedOrgApiKeys.mockResolvedValue(undefined);
    mocks.auditLog.mockResolvedValue(undefined);
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

  it("rejects a request without the signature header", async () => {
    const response = await chbWebhookHandler(
      new NextRequest("http://localhost/api/billing/clickhouse-webhook", {
        method: "POST",
        body: JSON.stringify(bundleCreated({ status: "active" })),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Webhook error: missing signature header",
    });
    // Nothing downstream runs on an unverified body, not even the dedupe claim.
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it("rejects an envelope without data.organizationId", async () => {
    const event = bundleCreated({ status: "active" });
    const response = await chbWebhookHandler(
      post({ ...event, data: { ...event.data, organizationId: undefined } }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Webhook error: invalid payload",
    });
    expect(mocks.findOrg).not.toHaveBeenCalled();
  });

  it("persists data.organizationId and occurredAt on the clickhouse block", async () => {
    await chbWebhookHandler(post(bundleCreated({ status: "active" })));

    expect(orgColumnsOfUpdate().cloudConfig).toMatchObject({
      clickhouse: {
        organizationId: CHB_ORG_ID,
        bundleId: "bundle_1",
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      },
    });
  });

  it("drops an event that occurred at or before the last applied one", async () => {
    mocks.findOrg.mockResolvedValue(
      orgRow({
        organizationId: CHB_ORG_ID,
        lastEventCreatedAt: "2026-07-01T00:00:00Z",
      }),
    );

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });

  it("keeps a failed project backfill out of the retry path", async () => {
    mocks.findProjects.mockRejectedValue(new Error("connection reset"));

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    // The bundle is already persisted, so the ordering guard would drop a
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

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    // Same commit-point rule; the stale cache entry expires with its TTL.
    expect(response.status).toBe(200);
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalled();
  });

  it("keeps a failed audit log write out of the retry path", async () => {
    mocks.auditLog.mockRejectedValue(new Error("connection reset"));

    const response = await chbWebhookHandler(
      post(bundleCreated({ status: "active" })),
    );

    // Post-commit like the cache invalidation: the state change is applied,
    // so the missing audit row is logged and paged rather than retried.
    expect(response.status).toBe(200);
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.traceException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection reset" }),
    );
  });
});
