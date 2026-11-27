import {
  type ChbPlanCode,
  chbPlanCodeToPlan,
  chbPlanCodes,
  type Plan,
} from "@langfuse/shared";

import { stripeProducts } from "./stripeCatalogue";

/**
 * Bridges between CHB plan codes and Stripe product ids.
 *
 * The code -> plan mapping itself lives in shared (`chbPlanCodeToPlan`), because
 * `cloudConfigSchema` validates stored codes against it. What cannot live there
 * is the Stripe product id: the plan-selection tRPC mutations and several
 * billing components still speak `stripeProductId`, so a CHB org's plan has to
 * be translated in both directions until plan-code-first inputs ship. Ordering
 * is read off `stripeProducts` for the same reason — one order table for both
 * providers, so an upgrade cannot be classified differently depending on who
 * bills the org.
 *
 * This module is imported client-side, so it must not pull in the server logger:
 * lookups return null and let the call site decide.
 */

const planToChbPlanCode = Object.fromEntries(
  chbPlanCodes.map((planCode) => [chbPlanCodeToPlan[planCode], planCode]),
) as Partial<Record<Plan, ChbPlanCode>>;

const planForChbPlanCode = (planCode: string): Plan | undefined =>
  chbPlanCodeToPlan[planCode as ChbPlanCode];

const orderKeyForPlan = (plan: Plan | undefined): number =>
  (plan &&
    stripeProducts.find((product) => product.mappedPlan === plan)?.orderKey) ??
  0;

export const mapStripeProductIdToChbPlanCode = (
  stripeProductId: string,
): ChbPlanCode | null => {
  const mappedPlan = stripeProducts.find(
    (product) => product.stripeProductId === stripeProductId,
  )?.mappedPlan;
  return (mappedPlan && planToChbPlanCode[mappedPlan]) ?? null;
};

export const mapChbPlanCodeToStripeProductId = (
  planCode: string,
): string | null => {
  const mappedPlan = planForChbPlanCode(planCode);
  return mappedPlan
    ? (stripeProducts.find((product) => product.mappedPlan === mappedPlan)
        ?.stripeProductId ?? null)
    : null;
};

export const isChbUpgrade = (
  currentPlanCode: string,
  newPlanCode: string,
): boolean =>
  orderKeyForPlan(planForChbPlanCode(currentPlanCode)) <
  orderKeyForPlan(planForChbPlanCode(newPlanCode));
