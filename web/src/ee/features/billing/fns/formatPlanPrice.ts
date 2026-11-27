import {
  type CloudPlan,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";

/** A plan's base fee as shown: "Free" or "$2,499 / month". */
export function formatPlanPrice(plan: CloudPlan): string {
  const { monthlyPrice } = pricingPlans[plan];
  return monthlyPrice === 0
    ? "Free"
    : `$${monthlyPrice.toLocaleString("en-US")} / month`;
}
