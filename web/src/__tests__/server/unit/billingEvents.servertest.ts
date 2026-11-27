import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "DEV" },
}));

vi.mock("@/src/features/posthog-analytics/ServerPosthog", () => ({
  getServerPosthog: () => ({ capture: vi.fn() }),
}));

vi.mock("@/src/features/auth/lib/createProjectMembershipsOnSignup", () => ({
  isProductionCloudRegion: () => false,
}));

import {
  createBillingEventCapture,
  planChangeDirection,
  planOfProduct,
} from "@/src/ee/features/billing/server/billingEvents";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";

const context = {
  userId: "user-1",
  organizationId: "org-1",
  plan: "cloud:pro",
  billingProvider: "stripe",
} as const;

const createCapture = (isEnabled = true) => {
  const capture = vi.fn();
  return {
    capture,
    captureBillingEvent: createBillingEventCapture({
      capture,
      isEnabled: () => isEnabled,
    }),
  };
};

describe("captureBillingEvent", () => {
  it("sends the event once, keyed on the user, with the organization, plan and provider", () => {
    const { capture, captureBillingEvent } = createCapture();

    captureBillingEvent(context, "billing:cancellation_scheduled", {
      reason: "too_expensive",
      reasonPosition: 3,
      hasNote: true,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "billing:cancellation_scheduled",
      properties: {
        organizationId: "org-1",
        plan: "cloud:pro",
        billingProvider: "stripe",
        reason: "too_expensive",
        reasonPosition: 3,
        hasNote: true,
      },
    });
  });

  it("sends nothing outside production Cloud regions", () => {
    const { capture, captureBillingEvent } = createCapture(false);

    captureBillingEvent(context, "billing:cancellation_reverted", {});

    expect(capture).not.toHaveBeenCalled();
  });

  it("never fails the billing request when the capture throws", () => {
    const captureBillingEvent = createBillingEventCapture({
      capture: () => {
        throw new Error("PostHog is down");
      },
      isEnabled: () => true,
    });

    expect(() =>
      captureBillingEvent(context, "billing:plan_change_reverted", {}),
    ).not.toThrow();
  });
});

describe("planChangeDirection", () => {
  it("reads the direction from the price list", () => {
    expect(planChangeDirection("cloud:core", "cloud:team")).toBe("upgrade");
    expect(planChangeDirection("cloud:enterprise", "cloud:pro")).toBe(
      "downgrade",
    );
    expect(planChangeDirection("cloud:pro", "cloud:pro")).toBe("same");
  });

  it("treats a plan outside the price list as the bottom", () => {
    expect(planChangeDirection("cloud:hobby", "cloud:core")).toBe("upgrade");
    expect(planChangeDirection(null, "cloud:core")).toBe("upgrade");
  });
});

describe("planOfProduct", () => {
  it("maps a product id to its plan and an unknown id to null", () => {
    const pro = stripeProducts.find(
      (product) => product.mappedPlan === "cloud:pro",
    );
    expect(planOfProduct(pro?.stripeProductId ?? "")).toBe("cloud:pro");
    expect(planOfProduct("prod_unknown")).toBeNull();
  });
});
