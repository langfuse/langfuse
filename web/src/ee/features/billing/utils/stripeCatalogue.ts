import { env } from "@/src/env.mjs";
import {
  mapStripeProductIdToPlan,
  stripeProductIdByPlan,
  type Plan,
} from "@langfuse/shared";

import {
  type CloudPlan,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { formatPlanPrice } from "@/src/ee/features/billing/fns/formatPlanPrice";

/** A plan a customer can subscribe to, named and priced as the plan table has it. */
const checkoutOf = (plan: CloudPlan) => ({
  title: pricingPlans[plan].name,
  price: formatPlanPrice(plan),
});

const isTestEnvironment =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING";

type StripeProduct = {
  stripeProductId: string;
  orderKey?: number | undefined; // to check whether a plan is upgraded or downgraded
  mappedPlan: Plan;
  // include checkout if product can be subscribed to by new users
  checkout: { title: string; price: string } | null;
};

// Backward-compatible export: same name and shape as before
export const stripeProducts: StripeProduct[] = [
  {
    stripeProductId: stripeProductIdByPlan["cloud:core"],
    mappedPlan: "cloud:core",
    orderKey: 29,
    checkout: checkoutOf("cloud:core"),
  },
  {
    stripeProductId: stripeProductIdByPlan["cloud:pro"],
    mappedPlan: "cloud:pro",
    orderKey: 199,
    checkout: checkoutOf("cloud:pro"),
  },
  {
    stripeProductId: stripeProductIdByPlan["cloud:team"],
    mappedPlan: "cloud:team",
    orderKey: 499,
    checkout: checkoutOf("cloud:team"),
  },
  {
    stripeProductId: stripeProductIdByPlan["cloud:enterprise"],
    mappedPlan: "cloud:enterprise",
    orderKey: 2499,
    checkout: checkoutOf("cloud:enterprise"),
  },
];

const stripeUsageProduct = {
  id: isTestEnvironment
    ? "prod_T2DaIcLiiR78rs" // sandbox
    : "prod_T4nLLI2vn876J2",
};

const isUpgrade = (oldProductId: string, newProductId: string): boolean => {
  const oldProduct = stripeProducts.find(
    (product) => product.stripeProductId === oldProductId,
  );
  const newProduct = stripeProducts.find(
    (product) => product.stripeProductId === newProductId,
  );
  return (oldProduct?.orderKey ?? 0) < (newProduct?.orderKey ?? 0);
};

const isValidCheckoutProduct = (id: string) => {
  return stripeProducts.some(
    (p) => Boolean(p.checkout) && p.stripeProductId === id,
  );
};

export const StripeCatalogue = {
  products: stripeProducts,
  usageProductId: () => stripeUsageProduct.id,
  isValidCheckoutProduct: isValidCheckoutProduct,
  isUpgrade,
  mapStripeProductIdToPlan,
} as const;
