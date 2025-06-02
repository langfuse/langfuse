import { env } from "@/src/env.mjs";
import { type Plan } from "@langfuse/shared";

type StripeProduct = {
  stripeProductId: string;
  mappedPlan: Plan;
  // include checkout if product can be subscribed to by new users
  checkout: {
    title: string;
    description: string;
    price: string;
    usagePrice: string;
    mainFeatures: string[];
  } | null;
};

// map of planid to plan name
export const stripeProducts: StripeProduct[] = [
  {
    stripeProductId:
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
        ? "prod_RoBuRrXjIUBIJ8" // test
        : "prod_RoYirvRQ4Kc6po", // live
    mappedPlan: "cloud:core",
    checkout: {
      title: "Core",
      description:
        "Great to get started for most projects with unlimited users and 90 days data access.",
      price: "$59 / month",
      usagePrice: "$8/100k events (100k included)",
      mainFeatures: [
        "90 days data access",
        "Unlimited users",
        "Unlimited evaluators",
        "Support via Email/Chat",
      ],
    },
  },
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
        "For projects that scale and need unlimited data access, high rate limits, and Slack support.",
      price: "$199 / month",
      usagePrice: "$8/100k events (100k included)",
      mainFeatures: [
        "Everything in Core",
        "Unlimited data access",
        "Unlimited annotation queues",
        "High rate limits",
        "SOC2, ISO27001 reports",
        "Support via Slack",
      ],
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
      title: "Pro + Teams Add-on",
      description: "Organizational and security controls for larger teams.",
      price: "$499 / month",
      usagePrice: "$8/100k events (100k included)",
      mainFeatures: [
        "Everything in Pro",
        "Enterprise SSO (e.g. Okta)",
        "SSO enforcement",
        "Fine-grained RBAC",
        "Data retention management",
      ],
    },
  },
];

export const mapStripeProductIdToPlan = (productId: string): Plan | null =>
  stripeProducts.find((product) => product.stripeProductId === productId)
    ?.mappedPlan ?? null;
