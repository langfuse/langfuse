import { type Plan } from "@langfuse/shared";

import { stripeProducts } from "./stripeCatalogue";

/**
 * ClickHouse Billing (CHB) plan catalogue — thin twin of stripeCatalogue.
 *
 * CHB identifies plans by `planCode`; Langfuse resolves everything downstream
 * (entitlements, rate limits, UI gating) off the same `Plan` enum both
 * catalogues map onto. Order keys mirror stripeCatalogue so upgrade/downgrade
 * classification is identical across providers.
 */

export type ChbPlanCode = "core" | "pro" | "team" | "enterprise";

type ChbPlan = {
  planCode: ChbPlanCode;
  mappedPlan: Plan;
  orderKey: number; // to check whether a plan change is an upgrade or downgrade
};

export const chbPlans: ChbPlan[] = [
  { planCode: "core", mappedPlan: "cloud:core", orderKey: 29 },
  { planCode: "pro", mappedPlan: "cloud:pro", orderKey: 199 },
  { planCode: "team", mappedPlan: "cloud:team", orderKey: 499 },
  { planCode: "enterprise", mappedPlan: "cloud:enterprise", orderKey: 2499 },
];

/**
 * Map a CHB plan code to the Langfuse plan. Returns null for unknown codes so
 * callers fail open to the free tier (never to a paid tier) and log at the
 * call site — this module is imported client-side, so it must not pull in the
 * server logger.
 */
export const mapChbPlanCodeToPlan = (planCode: string): Plan | null =>
  chbPlans.find((p) => p.planCode === planCode)?.mappedPlan ?? null;

export const mapPlanToChbPlanCode = (plan: Plan): ChbPlanCode | null =>
  chbPlans.find((p) => p.mappedPlan === plan)?.planCode ?? null;

/**
 * Transitional bridge (CHB integration plan §3.4): the plan-selection tRPC
 * mutations still take a `stripeProductId`. For CHB orgs the service maps
 * product id → Plan → PlanCode via the two catalogues. Retire together with
 * the product-id input once plan-code-first inputs ship.
 */
export const mapStripeProductIdToChbPlanCode = (
  stripeProductId: string,
): ChbPlanCode | null => {
  const mappedPlan = stripeProducts.find(
    (product) => product.stripeProductId === stripeProductId,
  )?.mappedPlan;
  return mappedPlan ? mapPlanToChbPlanCode(mappedPlan) : null;
};

/**
 * Reverse bridge for UI compatibility: components resolve plan labels and
 * pending-switch targets via Stripe product ids, so CHB subscription info is
 * translated back until plan-code-first inputs ship.
 */
export const mapChbPlanCodeToStripeProductId = (
  planCode: string,
): string | null => {
  const mappedPlan = mapChbPlanCodeToPlan(planCode);
  return mappedPlan
    ? (stripeProducts.find((product) => product.mappedPlan === mappedPlan)
        ?.stripeProductId ?? null)
    : null;
};

export const isChbUpgrade = (
  currentPlanCode: string,
  newPlanCode: string,
): boolean => {
  const current = chbPlans.find((p) => p.planCode === currentPlanCode);
  const next = chbPlans.find((p) => p.planCode === newPlanCode);
  return (current?.orderKey ?? 0) < (next?.orderKey ?? 0);
};

export const ChbCatalogue = {
  plans: chbPlans,
  mapChbPlanCodeToPlan,
  mapPlanToChbPlanCode,
  mapStripeProductIdToChbPlanCode,
  mapChbPlanCodeToStripeProductId,
  isUpgrade: isChbUpgrade,
} as const;
