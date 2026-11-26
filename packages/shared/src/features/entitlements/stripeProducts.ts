import { type Plan } from "./plans";

// The sandbox and live Stripe accounts use the same product ids.
export const stripeProductIdByPlan = {
  "cloud:core": "prod_RoYirvRQ4Kc6po",
  "cloud:pro": "prod_QhK7UMhrkVeF6R",
  "cloud:team": "prod_QhK9qKGH25BTcS",
  "cloud:enterprise": "prod_STnXok7GSSDmyF",
} as const satisfies Partial<Record<Plan, string>>;

type StripePlan = keyof typeof stripeProductIdByPlan;

export const mapStripeProductIdToPlan = (productId: string): Plan | null =>
  (Object.keys(stripeProductIdByPlan) as StripePlan[]).find(
    (plan) => stripeProductIdByPlan[plan] === productId,
  ) ?? null;
