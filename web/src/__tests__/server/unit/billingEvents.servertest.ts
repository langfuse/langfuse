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

import { createBillingEventCapture } from "@/src/ee/features/billing/server/billingEvents";

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
      captureBillingEvent(context, "billing:cancellation_reverted", {}),
    ).not.toThrow();
  });
});
