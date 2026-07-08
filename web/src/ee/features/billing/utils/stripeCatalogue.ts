import { env } from "@/src/env.mjs";
import { type Plan } from "@langfuse/shared";

const isTestEnvironment =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ||
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING";

type StripeProduct = {
  stripeProductId: string;
  orderKey?: number | undefined; // to check whether a plan is upgraded or downgraded
  mappedPlan: Plan;
  // include checkout if product can be subscribed to by new users
  checkout: {
    title: string;
    description: string;
    price: string;
    usagePrice: string;
    mainFeatures: string[];
    cta?: {
      label: string;
      href: string;
    };
  } | null;
};

// Backward-compatible export: same name and shape as before
export const stripeProducts: StripeProduct[] = [
  {
    stripeProductId: isTestEnvironment
      ? "prod_RoYirvRQ4Kc6po" // sandbox
      : "prod_RoYirvRQ4Kc6po", // live
    mappedPlan: "cloud:core",
    orderKey: 29,
    checkout: {
      title: "Core",
      description:
        "Great to get started for most projects with unlimited users and 90 days data access.",
      price: "$29 / month",
      usagePrice: "$8-6/100k units (100k included, graduated pricing)",
      mainFeatures: [
        "90 days data access",
        "Unlimited users",
        "Unlimited evaluators",
        "Support via Email/Chat",
      ],
    },
  },
  {
    stripeProductId: isTestEnvironment
      ? "prod_QhK7UMhrkVeF6R" // sandbox
      : "prod_QhK7UMhrkVeF6R", // live
    mappedPlan: "cloud:pro",
    orderKey: 199,
    checkout: {
      title: "Pro",
      description:
        "For projects that scale and need unlimited data access, high rate limits, and Slack support.",
      price: "$199 / month",
      usagePrice: "$8-6/100k units (100k included, graduated pricing)",
      mainFeatures: [
        "Everything in Core",
        "3 years data access",
        "Unlimited annotation queues",
        "Data retention management",
        "High rate limits",
        "SOC2, ISO27001 reports",
      ],
    },
  },
  {
    stripeProductId: isTestEnvironment
      ? "prod_QhK9qKGH25BTcS" // sandbox
      : "prod_QhK9qKGH25BTcS", // live
    mappedPlan: "cloud:team",
    orderKey: 499,
    checkout: {
      title: "Pro + Teams Add-on",
      description: "Organizational and security controls for larger teams.",
      price: "$499 / month",
      usagePrice: "$8-6/100k units (100k included, graduated pricing)",
      mainFeatures: [
        "Everything in Pro",
        "Enterprise SSO (e.g. Okta)",
        "SSO enforcement",
        "Fine-grained RBAC",
        "Support via Slack",
      ],
    },
  },
  {
    stripeProductId: isTestEnvironment
      ? "prod_STnXok7GSSDmyF" // sandbox
      : "prod_STnXok7GSSDmyF", // live
    mappedPlan: "cloud:enterprise",
    orderKey: 2499,
    checkout: {
      title: "Enterprise",
      description:
        "For large scale teams. Enterprise-grade support and security.",
      price: "$2499 / month",
      usagePrice: "$8-6/100k units (100k included, graduated pricing)",
      mainFeatures: [
        "Everything in Pro + Teams",
        "Audit Logs",
        "SCIM API",
        "Custom rate limits",
        "Uptime SLA",
        "Support SLA",
        "Dedicated support engineer",
      ],
      cta: {
        label: "Contact Sales",
        href: "https://langfuse.com/talk-to-us",
      },
    },
  },
];

export const stripeUsageProduct = {
  id: isTestEnvironment
    ? "prod_T2DaIcLiiR78rs" // sandbox
    : "prod_T4nLLI2vn876J2",
};

export const mapStripeProductIdToPlan = (productId: string): Plan | null =>
  stripeProducts.find((product) => product.stripeProductId === productId)
    ?.mappedPlan ?? null;

export const isUpgrade = (
  oldProductId: string,
  newProductId: string,
): boolean => {
  const oldProduct = stripeProducts.find(
    (product) => product.stripeProductId === oldProductId,
  );
  const newProduct = stripeProducts.find(
    (product) => product.stripeProductId === newProductId,
  );
  return (oldProduct?.orderKey ?? 0) < (newProduct?.orderKey ?? 0);
};

export const isValidCheckoutProduct = (id: string) => {
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
