import { env } from "@/src/env.mjs";
import {
  mapStripeProductIdToPlan,
  stripeProductIdByPlan,
  type Plan,
} from "@langfuse/shared";

import {
  type CloudPlan,
  cloudPlans,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { planLimitChanges } from "@/src/ee/features/billing/fns/planLimitChanges";

/** A plan's card lines: the plan below it, the limits it raises, then the lines it adds. */
const cardLines = (plan: CloudPlan): ReadonlyArray<string> => {
  const below = cloudPlans[cloudPlans.indexOf(plan) - 1];
  const limits = planLimitChanges(below ?? plan, plan)
    .filter((limit) => below === undefined || limit.direction !== "same")
    .map((limit) => `${limit.now} ${limit.label.toLowerCase()}`);
  return [
    ...(below ? [`Everything in ${pricingPlans[below].name}`] : []),
    ...limits,
    ...pricingPlans[plan].lines.map((line) => line.text),
  ];
};

const TEAMS_ADD_ON_NAME = "Teams Add-on";

/** A plans-dialog card in the plan table's words; Team is Pro's card plus the add-on's lines. */
const checkoutOf = (plan: CloudPlan) => {
  const { name, description, monthlyPrice, lines } = pricingPlans[plan];
  const isTeam = plan === "cloud:team";
  return {
    title: name,
    description,
    price: `$${monthlyPrice} / month`,
    usagePrice: "$8-6* per 100k units",
    mainFeatures: cardLines(isTeam ? "cloud:pro" : plan),
    ...(isTeam
      ? {
          addOn: {
            name: TEAMS_ADD_ON_NAME,
            mainFeatures: lines.map((line) => line.text),
          },
        }
      : {}),
  };
};

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
    mainFeatures: ReadonlyArray<string>;
    /** Lines an add-on brings, listed under its name after the plan's own. */
    addOn?: { name: string; mainFeatures: ReadonlyArray<string> };
    cta?: {
      label: string;
      href: string;
    };
  } | null;
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
    checkout: {
      ...checkoutOf("cloud:enterprise"),
      cta: {
        label: "Contact Sales",
        href: "https://langfuse.com/talk-to-us",
      },
    },
  },
];

const stripeUsageProduct = {
  id: isTestEnvironment
    ? "prod_T2DaIcLiiR78rs" // sandbox
    : "prod_T4nLLI2vn876J2",
};

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
