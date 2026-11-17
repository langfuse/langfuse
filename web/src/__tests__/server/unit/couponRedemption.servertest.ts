import { describe, expect, it } from "vitest";

import { type CloudConfigSchema, InvalidRequestError } from "@langfuse/shared";

import { buildCouponRedemptionPayload } from "@/src/ee/features/billing/server/coupons/couponRedemption";

const CH_ORG_ID = "6f1c1c7e-2d1a-4a53-9a43-6b1b7f0d2c11";
const PAID: CloudConfigSchema = {
  clickhouse: { organizationId: CH_ORG_ID, attachedPlanId: "ap_1" },
};

const build = (cloudConfig: CloudConfigSchema | null, couponCode: string) =>
  buildCouponRedemptionPayload({
    org: { id: "org-1", cloudConfig },
    submitterEmail: "founder@example.com",
    couponCode,
    couponCodes: { "TEST-CODE-1": "Startup" },
  });

describe("buildCouponRedemptionPayload", () => {
  it("resolves the program from the code and submits the configured spelling", () => {
    expect(build(PAID, " test-code-1 ")).toEqual({
      program: "Startup",
      couponCode: "TEST-CODE-1",
      submitterEmail: "founder@example.com",
      clickhouseOrganizationId: CH_ORG_ID,
    });
  });

  it("returns null for a code that is not configured", () => {
    expect(build(PAID, "UNKNOWN")).toBeNull();
  });

  it.each([
    ["has never checked out", null],
    [
      "started checkout without a payment method",
      { clickhouse: { organizationId: CH_ORG_ID, attachedPlanId: null } },
    ],
  ])("rejects an org that %s before looking at the code", (_, cloudConfig) => {
    expect(() => build(cloudConfig, "UNKNOWN")).toThrow(InvalidRequestError);
  });
});
