import { describe, expect, it } from "vitest";

import {
  isChbUpgrade,
  mapChbPlanCodeToStripeProductId,
  mapStripeProductIdToChbPlanCode,
} from "@/src/ee/features/billing/utils/chbCatalogue";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";

describe("chbCatalogue", () => {
  it("bridges every Stripe product to a CHB plan code and back", () => {
    // The bridge exists because the plan-selection mutations still take a
    // stripeProductId; a product that cannot round-trip would strand a CHB org
    // on a plan it cannot change.
    for (const product of stripeProducts) {
      const planCode = mapStripeProductIdToChbPlanCode(product.stripeProductId);
      expect(planCode).not.toBeNull();
      expect(mapChbPlanCodeToStripeProductId(planCode!)).toBe(
        product.stripeProductId,
      );
    }
  });

  it.each([
    ["an unknown Stripe product id", "prod_unknown"],
    ["an empty product id", ""],
  ])("returns null when bridging %s", (_label, productId) => {
    expect(mapStripeProductIdToChbPlanCode(productId)).toBeNull();
  });

  it.each([
    ["an unknown plan code", "platinum"],
    ["an empty plan code", ""],
    // CHB lists a Hobby tier, but a free Langfuse org carries no CHB bundle, so
    // no Stripe product maps to it. Since the outbound plan code is only ever
    // produced by this lookup, that is what keeps us from ever sending it.
    ["CHB's Hobby tier", "LANGFUSE_HOBBY"],
  ])("returns null when bridging %s to a product id", (_label, planCode) => {
    expect(mapChbPlanCodeToStripeProductId(planCode)).toBeNull();
  });

  it("classifies upgrades and downgrades by the shared Stripe order keys", () => {
    expect(isChbUpgrade("LANGFUSE_CORE", "LANGFUSE_PRO")).toBe(true);
    expect(isChbUpgrade("LANGFUSE_PRO", "LANGFUSE_PRO_TEAMS")).toBe(true);
    expect(isChbUpgrade("LANGFUSE_PRO_TEAMS", "LANGFUSE_CORE")).toBe(false);
    expect(isChbUpgrade("LANGFUSE_ENTERPRISE", "LANGFUSE_ENTERPRISE")).toBe(
      false,
    );
  });

  it("does not treat a drifted plan code as an upgrade", () => {
    // A code CHB ships before we deploy support for it resolves to order key 0.
    // It must not read as an upgrade from a real tier, which would let a
    // downgrade apply immediately instead of at cycle end.
    expect(isChbUpgrade("LANGFUSE_PRO_TEAMS", "platinum")).toBe(false);
    expect(isChbUpgrade("platinum", "LANGFUSE_PRO_TEAMS")).toBe(true);
  });
});
