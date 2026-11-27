import {
  type CloudPlan,
  cloudPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

/**
 * What the picker's button does for the picked plan.
 * - `none`: the current plan, nothing to undo
 * - `scheduled`: the plan a switch is already scheduled to
 * - `checkout`: a free organization buys the plan
 * - `upgrade` / `downgrade`: a plan change, charged now or scheduled for the period end
 * - `switch-now`: a legacy subscription is replaced at once
 * - `keep`: remove a scheduled switch; `reactivate`: remove a scheduled cancellation
 * - `payment-method-required`: a change that cannot start without a payment method
 */
export type PlanPickerAction =
  | "none"
  | "scheduled"
  | "checkout"
  | "upgrade"
  | "downgrade"
  | "switch-now"
  | "keep"
  | "reactivate"
  | "payment-method-required";

const undoOf = (
  pending: PlanPickerSubscription["pending"],
): PlanPickerAction => {
  if (pending === null) return "none";
  switch (pending.kind) {
    case "cancel":
      return "reactivate";
    case "switch":
      return "keep";
  }
};

export function planPickerAction(
  currentPlan: CloudPlan,
  pickedPlan: CloudPlan,
  subscription: PlanPickerSubscription,
): PlanPickerAction {
  const { hasSubscription, isLegacy, hasValidPaymentMethod, pending } =
    subscription;
  const isCurrent = pickedPlan === currentPlan;

  if (!hasSubscription) return isCurrent ? "none" : "checkout";
  if (isCurrent) return undoOf(pending);
  if (pending?.kind === "switch" && pending.to === pickedPlan)
    return "scheduled";
  if (!hasValidPaymentMethod) return "payment-method-required";
  if (isLegacy) return "switch-now";
  return cloudPlans.indexOf(pickedPlan) > cloudPlans.indexOf(currentPlan)
    ? "upgrade"
    : "downgrade";
}
