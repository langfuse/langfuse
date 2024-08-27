import { env } from "@/src/env.mjs";
import { type Plan } from "@/src/features/entitlements/constants/plans";

type StripeProduct = {
  stripeProductId: string;
  mappedPlan: Plan;
  // include checkout if product can be subscribed to by new users
  checkout: {
    title: string;
    description: string;
    price: string;
  } | null;
};

// map of planid to plan name
export const stripeProducts: StripeProduct[] = [
  {
    stripeProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_QgDNYKXcBfvUQ3" // test
        : "prod_QhK7UMhrkVeF6R", // live
    mappedPlan: "cloud:pro",
    checkout: {
      title: "Pro",
      description:
        "For serious projects. Includes access to full history and higher usage.",
      price: "$59 / month + $10/100k observations",
    },
  },
  {
    stripeProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_QgDOxTD64U6KDv" // test
        : "prod_QhK9qKGH25BTcS", // live
    mappedPlan: "cloud:team",
    checkout: {
      title: "Team",
      description:
        "Dedicated solutions and support for your team. Contact us for additional add-ons listed on the pricing page.",
      price: "$499 / month + $10/100k observations",
    },
  },
];

export const mapStripeProductIdToPlan = (productId: string): Plan | null =>
  stripeProducts.find((product) => product.stripeProductId === productId)
    ?.mappedPlan ?? null;
