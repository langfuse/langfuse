import { describe, expect, it } from "vitest";

import { type CloudConfigSchema, InvalidRequestError } from "@langfuse/shared";

import { buildCouponRedemptionPayload } from "@/src/ee/features/billing/server/coupons/couponRedemption";

const CH_ORG_ID = "6f1c1c7e-2d1a-4a53-9a43-6b1b7f0d2c11";

const build = (cloudConfig: CloudConfigSchema | null) =>
  buildCouponRedemptionPayload({
    org: { id: "org-1", cloudConfig },
    submitterEmail: "founder@example.com",
    program: "yc",
    couponCode: "YC-W27",
    cloudRegion: "EU",
  });

describe("buildCouponRedemptionPayload", () => {
  it("addresses the org's ClickHouse organization as the session user", () => {
    expect(
      build({
        clickhouse: { organizationId: CH_ORG_ID, attachedPlanId: "ap_1" },
      }),
    ).toEqual({
      program: "yc",
      couponCode: "YC-W27",
      submitterEmail: "founder@example.com",
      clickhouseOrganizationId: CH_ORG_ID,
      langfuseOrganizationId: "org-1",
      langfuseCloudRegion: "EU",
    });
  });

  it.each([
    ["has never checked out", null],
    [
      "started checkout without a payment method",
      { clickhouse: { organizationId: CH_ORG_ID, attachedPlanId: null } },
    ],
  ])("rejects an org that %s", (_, cloudConfig) => {
    expect(() => build(cloudConfig)).toThrow(InvalidRequestError);
  });
});
