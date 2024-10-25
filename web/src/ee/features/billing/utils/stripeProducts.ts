import { env } from "@/src/env.mjs";
import { type CloudConfigSchema, type Plan } from "@langfuse/shared";

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
    mappedPlan: "cloud:pro",
    checkout: true,
  },
  {
    stripeUsageProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_QgDOxTD64U6KDv" // test
        : "prod_QhK9qKGH25BTcS", // live
    stripeSeatsProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_QgDOxTD64U6KDv" // test
        : "prod_QhK9qKGH25BTcS", // live
    mappedPlan: "cloud:team",
    checkout: false,
  },
];

export const mapCloudConfigToPlan = (
  cloudConfig: CloudConfigSchema,
): Plan | null =>
  stripeProducts.find((product) => product.stripeUsageProductId === productId)
    ?.mappedPlan ?? null;
