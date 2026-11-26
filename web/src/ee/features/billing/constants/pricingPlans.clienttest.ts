import { entitlementAccess, type EntitlementLimit } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";

import {
  cloudPlans,
  type PlanLimitKind,
  type PlanLimitValue,
  pricingPlans,
} from "./pricingPlans";

/** The limits the app enforces through the entitlements table. */
const enforcedBy: Partial<Record<PlanLimitKind, EntitlementLimit>> = {
  users: "organization-member-count",
  "data-access": "data-access-days",
  "annotation-queues": "annotation-queue-count",
  alerts: "monitor-count",
};

const asCount = (value: PlanLimitValue | false): number =>
  typeof value === "number" ? value : Number.POSITIVE_INFINITY;

describe("pricingPlans", () => {
  it.each(cloudPlans)("%s promises no more than the app enforces", (plan) => {
    const enforced = entitlementAccess[plan].entitlementLimits;
    for (const [kind, limit] of Object.entries(enforcedBy)) {
      const shown = pricingPlans[plan].limits[kind as PlanLimitKind];
      expect(asCount(shown), `${plan} ${kind}`).toBeLessThanOrEqual(
        asCount(enforced[limit]),
      );
    }
  });

  it("states the free plan's units as the billing page counts them", () => {
    expect(pricingPlans["cloud:hobby"].limits.units).toBe(MAX_EVENTS_FREE_PLAN);
  });

  it("never lowers a limit on a higher plan", () => {
    cloudPlans.slice(1).forEach((plan, index) => {
      const below = cloudPlans[index]!;
      for (const kind of Object.keys(enforcedBy) as PlanLimitKind[]) {
        expect(
          asCount(pricingPlans[plan].limits[kind]),
          `${plan} ${kind}`,
        ).toBeGreaterThanOrEqual(asCount(pricingPlans[below].limits[kind]));
      }
    });
  });

  it("orders the plans as the Stripe catalogue does", () => {
    const paid = cloudPlans.filter((plan) => plan !== "cloud:hobby");
    const byOrderKey = [...stripeProducts]
      .sort((a, b) => (a.orderKey ?? 0) - (b.orderKey ?? 0))
      .map((product) => product.mappedPlan);
    expect(byOrderKey).toEqual(paid);
    for (const product of stripeProducts) {
      expect(product.orderKey).toBe(
        pricingPlans[product.mappedPlan as (typeof paid)[number]].monthlyPrice,
      );
    }
  });

  it("gives the plans dialog's cards the table's words", () => {
    const card = (plan: string) =>
      stripeProducts.find((product) => product.mappedPlan === plan)?.checkout;

    expect(card("cloud:core")).toMatchObject({
      title: "Core",
      price: "$29 / month",
      mainFeatures: [
        "Everything in Hobby",
        "100k units a month",
        "90 days data access",
        "Unlimited users",
        "3 annotation queues",
        "20 alerts",
        "4,000 / min ingestion",
        "In-app support",
      ],
    });
    expect(card("cloud:team")).toMatchObject({
      title: "Pro + Teams Add-on",
      mainFeatures: card("cloud:pro")?.mainFeatures,
      addOn: {
        name: "Teams Add-on",
        mainFeatures: pricingPlans["cloud:team"].lines.map((line) => line.text),
      },
    });
    expect(card("cloud:enterprise")?.mainFeatures).toEqual([
      "Everything in Pro + Teams Add-on",
      "100 alerts",
      "Custom ingestion",
      ...pricingPlans["cloud:enterprise"].lines.map((line) => line.text),
    ]);
  });
});
