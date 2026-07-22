import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getBillingProvider,
  getChbCutoffDate,
  hasPaidBillingState,
} from "./billingProvider";
import { CloudConfigSchema } from "./cloudConfigSchema";

const CHB_ORG_ID = "0d5e6f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";

const orgWith = (cloudConfig: unknown) => ({
  cloudConfig:
    cloudConfig === null ? null : CloudConfigSchema.parse(cloudConfig),
});

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

describe("getBillingProvider", () => {
  const originalCutoff = process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE;

  beforeEach(() => {
    delete process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE;
  });

  afterEach(() => {
    if (originalCutoff === undefined) {
      delete process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE;
    } else {
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = originalCutoff;
    }
  });

  describe("orgs with existing Stripe state are pinned to stripe", () => {
    it.each([
      ["customerId only", { stripe: { customerId: "cus_123" } }],
      [
        "activeSubscriptionId only",
        { stripe: { activeSubscriptionId: "sub_123" } },
      ],
      [
        "full subscription state",
        {
          stripe: {
            customerId: "cus_123",
            activeSubscriptionId: "sub_123",
            activeProductId: "prod_123",
          },
        },
      ],
    ])("%s, even with a past cutoff", (_label, cloudConfig) => {
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = PAST;
      expect(getBillingProvider(orgWith(cloudConfig))).toBe("stripe");
    });
  });

  describe("orgs with CHB state resolve to clickhouse", () => {
    it("with cutoff unset (sticky decision)", () => {
      expect(
        getBillingProvider(
          orgWith({ clickhouse: { organizationId: CHB_ORG_ID } }),
        ),
      ).toBe("clickhouse");
    });

    it("with a future cutoff (sticky decision)", () => {
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = FUTURE;
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
    ])("%s: cutoff unset resolves to stripe", (_label, cloudConfig) => {
      expect(getBillingProvider(orgWith(cloudConfig))).toBe("stripe");
    });

    it("cutoff in the past resolves to clickhouse", () => {
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = PAST;
      expect(getBillingProvider(orgWith({}))).toBe("clickhouse");
    });

    it("cutoff in the future resolves to stripe", () => {
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = FUTURE;
      expect(getBillingProvider(orgWith({}))).toBe("stripe");
    });

    it("cutoff boundary: now exactly at the cutoff resolves to clickhouse", () => {
      const cutoff = "2026-01-01T00:00:00.000Z";
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = cutoff;
      expect(getBillingProvider(orgWith({}), { now: new Date(cutoff) })).toBe(
        "clickhouse",
      );
      expect(
        getBillingProvider(orgWith({}), {
          now: new Date(new Date(cutoff).getTime() - 1),
        }),
      ).toBe("stripe");
    });

    it("unparseable cutoff fails closed to stripe", () => {
      process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE = "not-a-date";
      expect(getChbCutoffDate()).toBeNull();
      expect(getBillingProvider(orgWith({}))).toBe("stripe");
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
