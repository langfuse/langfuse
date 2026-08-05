import { describe, expect, it } from "vitest";

import { getBillingProvider, hasPaidBillingState } from "./billingProvider";
import { CloudConfigSchema } from "./cloudConfigSchema";

const CHB_ORG_ID = "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";

const orgWith = (cloudConfig: unknown) => ({
  cloudConfig:
    cloudConfig === null ? null : CloudConfigSchema.parse(cloudConfig),
});

// Cutoffs arrive as date-only env values, i.e. UTC midnight.
const PAST = new Date("2020-01-01");

describe("getBillingProvider", () => {
  describe("orgs with existing Stripe state are pinned to stripe", () => {
    it.each([
      ["customerId only", { stripe: { customerId: "cus_123" } }],
      [
        "activeSubscriptionId only",
        { stripe: { activeSubscriptionId: "sub_123" } },
      ],
    ])("%s, even with a past cutoff", (_label, cloudConfig) => {
      expect(getBillingProvider(orgWith(cloudConfig), { cutoff: PAST })).toBe(
        "stripe",
      );
    });
  });

  describe("orgs with CHB state resolve to clickhouse", () => {
    it("with no cutoff (sticky decision)", () => {
      expect(
        getBillingProvider(
          orgWith({ clickhouse: { organizationId: CHB_ORG_ID } }),
        ),
      ).toBe("clickhouse");
    });

    it("on both-state conflict, explicit CHB state wins", () => {
      // Must never happen (interlocks in both checkout paths); if it does,
      // the org stays on the provider that holds its live bundle.
      expect(
        getBillingProvider(
          orgWith({
            stripe: { customerId: "cus_123" },
            clickhouse: { organizationId: CHB_ORG_ID },
          }),
        ),
      ).toBe("clickhouse");
    });
  });

  describe("never-billed orgs follow the cutoff", () => {
    it.each([
      ["empty cloudConfig", {}],
      ["null cloudConfig", null],
      ["manual plan override only", { plan: "Team" }],
    ])("%s: no cutoff resolves to stripe", (_label, cloudConfig) => {
      expect(getBillingProvider(orgWith(cloudConfig))).toBe("stripe");
    });

    // `now` omitted on purpose: covers the real-clock default.
    it("cutoff in the past resolves to clickhouse", () => {
      expect(getBillingProvider(orgWith({}), { cutoff: PAST })).toBe(
        "clickhouse",
      );
    });

    it("cutoff boundary: now exactly at the cutoff resolves to clickhouse", () => {
      const cutoff = new Date("2026-01-01");
      expect(getBillingProvider(orgWith({}), { cutoff, now: cutoff })).toBe(
        "clickhouse",
      );
      expect(
        getBillingProvider(orgWith({}), {
          cutoff,
          now: new Date(cutoff.getTime() - 1),
        }),
      ).toBe("stripe");
    });
  });
});

describe("hasPaidBillingState", () => {
  it.each([
    [
      "active Stripe subscription",
      { stripe: { activeSubscriptionId: "sub_123" } },
      true,
    ],
    ["manual plan override", { plan: "Team" }, true],
    [
      "CHB bundle",
      { clickhouse: { organizationId: CHB_ORG_ID, bundleId: "bdl_123" } },
      true,
    ],
    [
      "Stripe customer without subscription",
      { stripe: { customerId: "cus_123" } },
      false,
    ],
    [
      "CHB org id without bundle (checkout started, never completed)",
      { clickhouse: { organizationId: CHB_ORG_ID } },
      false,
    ],
    ["empty cloudConfig", {}, false],
    ["null cloudConfig", null, false],
  ])("%s -> %s", (_label, cloudConfig, expected) => {
    expect(hasPaidBillingState(orgWith(cloudConfig))).toBe(expected);
  });
});
