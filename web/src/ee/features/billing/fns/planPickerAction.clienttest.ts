import { describe, expect, it } from "vitest";

import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

import { planPickerAction } from "./planPickerAction";

const paid: PlanPickerSubscription = {
  hasSubscription: true,
  isLegacy: false,
  hasValidPaymentMethod: true,
  trialPlanName: null,
  periodEnd: "Dec 26, 2026",
  pending: null,
};
const free: PlanPickerSubscription = {
  ...paid,
  hasSubscription: false,
  hasValidPaymentMethod: false,
  periodEnd: null,
};

describe("planPickerAction", () => {
  it("sends an organization without a subscription to checkout", () => {
    expect(planPickerAction("cloud:hobby", "cloud:pro", free)).toBe("checkout");
    expect(planPickerAction("cloud:hobby", "cloud:hobby", free)).toBe("none");
  });

  it("upgrades to a higher plan and downgrades to a lower one", () => {
    expect(planPickerAction("cloud:pro", "cloud:team", paid)).toBe("upgrade");
    expect(planPickerAction("cloud:pro", "cloud:core", paid)).toBe("downgrade");
    expect(planPickerAction("cloud:pro", "cloud:pro", paid)).toBe("none");
  });

  it("replaces a legacy subscription at once, in either direction", () => {
    const legacy = { ...paid, isLegacy: true };
    expect(planPickerAction("cloud:pro", "cloud:team", legacy)).toBe(
      "switch-now",
    );
    expect(planPickerAction("cloud:pro", "cloud:core", legacy)).toBe(
      "switch-now",
    );
  });

  it("needs a payment method for a change, not for the current plan", () => {
    const noCard = { ...paid, hasValidPaymentMethod: false };
    expect(planPickerAction("cloud:pro", "cloud:team", noCard)).toBe(
      "payment-method-required",
    );
    expect(planPickerAction("cloud:pro", "cloud:pro", noCard)).toBe("none");
  });

  it("with a switch scheduled: keep on the current plan, nothing on the target, a change elsewhere", () => {
    const scheduled: PlanPickerSubscription = {
      ...paid,
      pending: { kind: "switch", to: "cloud:core" },
    };
    expect(planPickerAction("cloud:pro", "cloud:pro", scheduled)).toBe("keep");
    expect(planPickerAction("cloud:pro", "cloud:core", scheduled)).toBe(
      "scheduled",
    );
    expect(planPickerAction("cloud:pro", "cloud:team", scheduled)).toBe(
      "upgrade",
    );
  });

  it("with a cancellation scheduled: reactivate on the current plan, a change elsewhere", () => {
    const cancelled: PlanPickerSubscription = {
      ...paid,
      pending: { kind: "cancel" },
    };
    expect(planPickerAction("cloud:pro", "cloud:pro", cancelled)).toBe(
      "reactivate",
    );
    expect(planPickerAction("cloud:pro", "cloud:core", cancelled)).toBe(
      "downgrade",
    );
  });
});
