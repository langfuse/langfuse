import {
  type CloudPlan,
  type PlanLine,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { planLineChanges } from "@/src/ee/features/billing/fns/planLineChanges";

/** Every feature line a plan has, its own first, each kind said once. */
export function planIncludedLines(plan: CloudPlan): ReadonlyArray<PlanLine> {
  if (plan === "cloud:hobby") return pricingPlans[plan].lines;
  const gained = planLineChanges("cloud:hobby", plan);
  return [...gained.own, ...gained.inherited];
}
