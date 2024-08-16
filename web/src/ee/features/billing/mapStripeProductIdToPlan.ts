import { type Plan } from "@/src/features/entitlements/constants/plans";

// map of planid to plan name
const stripeProducts: Record<string, Plan> = {
  prod_P47h5SDEr9vJZk: "cloud:pro",
  prod_PAo9J9pxepZQVe: "cloud:team",
};

export const mapStripeProductIdToPlan = (productId: string): Plan | null =>
  stripeProducts[productId] ?? null;
