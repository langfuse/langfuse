import { env } from "@/src/env.mjs";
import { type Plan } from "@langfuse/shared";

type StripeProduct = {
  stripeUsageProductId: string;
  stripeSeatsProductId: string;
  mappedPlan: Plan;
  // include checkout if product can be subscribed to by new users
  checkout: boolean;
};

// map of planid to plan name
export const stripeProducts: readonly StripeProduct[] = [
  {
    mappedPlan: "cloud:pro",
    checkout: true,
    stripeUsageProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_QgDNYKXcBfvUQ3" // test
        : "prod_QhK7UMhrkVeF6R", // live
    stripeSeatsProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_R5cUtsHcxJv9dD" // test
        : "xxx", // live
  },
  {
    mappedPlan: "cloud:team",
    checkout: false,
    stripeUsageProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_QgDOxTD64U6KDv" // test
        : "prod_QhK9qKGH25BTcS", // live
    stripeSeatsProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "xxx" // test
        : "xxx", // live
  },
];

export const stripeSeatProductIds = stripeProducts.map(
  (product) => product.stripeSeatsProductId,
);

export const mapActiveProductIdsToPlan = (
  activeProductIds: string[],
): Plan | null => {
  return (
    stripeProducts.find(
      (product) =>
        activeProductIds.includes(product.stripeUsageProductId) ||
        activeProductIds.includes(product.stripeSeatsProductId),
    )?.mappedPlan ?? null
  );
};
