import {
  type CloudPlan,
  cloudPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

/** The plan the picker opens on: the next plan up, or the current plan on the top plan or with a change pending. */
export function defaultPickedPlan(
  currentPlan: CloudPlan,
  pending: PlanPickerSubscription["pending"],
): CloudPlan {
  if (pending) return currentPlan;
  return cloudPlans[cloudPlans.indexOf(currentPlan) + 1] ?? currentPlan;
}
