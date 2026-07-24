import crypto from "crypto";

import { describe, expect, it } from "vitest";

import {
  isChbUpgrade,
  mapChbPlanCodeToPlan,
  mapChbPlanCodeToStripeProductId,
  mapPlanToChbPlanCode,
  mapStripeProductIdToChbPlanCode,
} from "@/src/ee/features/billing/utils/chbCatalogue";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { verifyChbSignature } from "@/src/ee/features/billing/server/chb/chbWebhookHandler";

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

describe("chbCatalogue", () => {
  it.each([
    ["core", "cloud:core"],
    ["pro", "cloud:pro"],
    ["team", "cloud:team"],
    ["enterprise", "cloud:enterprise"],
  ])("maps plan code %s to %s and back", (planCode, plan) => {
    expect(mapChbPlanCodeToPlan(planCode)).toBe(plan);
    expect(mapPlanToChbPlanCode(plan as never)).toBe(planCode);
  });

  it("returns null for unknown plan codes (callers fail open to hobby)", () => {
    expect(mapChbPlanCodeToPlan("platinum")).toBeNull();
    expect(mapChbPlanCodeToPlan("")).toBeNull();
  });

  it("bridges every checkout-able Stripe product to a CHB plan code and back", () => {
    for (const product of stripeProducts) {
      const planCode = mapStripeProductIdToChbPlanCode(product.stripeProductId);
      expect(planCode).not.toBeNull();
      expect(mapChbPlanCodeToStripeProductId(planCode!)).toBe(
        product.stripeProductId,
      );
    }
  });

  it("returns null when bridging an unknown Stripe product id", () => {
    expect(mapStripeProductIdToChbPlanCode("prod_unknown")).toBeNull();
  });

  it("classifies upgrades and downgrades by order key", () => {
    expect(isChbUpgrade("core", "pro")).toBe(true);
    expect(isChbUpgrade("pro", "team")).toBe(true);
    expect(isChbUpgrade("team", "core")).toBe(false);
    expect(isChbUpgrade("enterprise", "enterprise")).toBe(false);
  });
});
