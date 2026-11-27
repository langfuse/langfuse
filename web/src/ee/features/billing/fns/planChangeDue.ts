import {
  type CloudPlan,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { formatPlanPrice } from "@/src/ee/features/billing/fns/formatPlanPrice";
import { type PlanPickerAction } from "@/src/ee/features/billing/fns/planPickerAction";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

export type PlanDueCell = { label: string; value: string };

const priceWithUsage = (plan: CloudPlan): string =>
  pricingPlans[plan].monthlyPrice === 0
    ? "Free"
    : `${formatPlanPrice(plan)} plus usage`;

const planAfterPeriod = (
  currentPlan: CloudPlan,
  pending: PlanPickerSubscription["pending"],
): CloudPlan => {
  if (pending === null) return currentPlan;
  switch (pending.kind) {
    case "cancel":
      return "cloud:hobby";
    case "switch":
      return pending.to;
  }
};

/** The two cells above the picker's buttons: what is due today and what the plan costs from when. */
export function planChangeDue(
  action: PlanPickerAction,
  currentPlan: CloudPlan,
  pickedPlan: CloudPlan,
  subscription: Pick<PlanPickerSubscription, "pending" | "periodEnd">,
): ReadonlyArray<PlanDueCell> {
  const { pending, periodEnd } = subscription;
  const fromPeriodEnd = periodEnd
    ? `From ${periodEnd}`
    : "From the next period";
  const picked = pricingPlans[pickedPlan];
  const current = pricingPlans[currentPlan];
  const after = planAfterPeriod(currentPlan, pending);

  switch (action) {
    case "checkout":
      return [
        {
          label: "Due today",
          value: `$${picked.monthlyPrice.toLocaleString("en-US")}, at checkout`,
        },
        { label: "Then", value: priceWithUsage(pickedPlan) },
      ];
    case "upgrade":
    case "payment-method-required": {
      const difference = picked.monthlyPrice - current.monthlyPrice;
      return [
        {
          label: "Due today",
          value:
            difference > 0
              ? `$${difference.toLocaleString("en-US")} or less, for the days left`
              : "Nothing",
        },
        { label: fromPeriodEnd, value: priceWithUsage(pickedPlan) },
      ];
    }
    case "downgrade":
    case "scheduled":
      return [
        { label: "Due today", value: "Nothing" },
        { label: fromPeriodEnd, value: priceWithUsage(pickedPlan) },
      ];
    case "switch-now":
      return [
        { label: "Due today", value: "A new invoice, starting a fresh period" },
        { label: "Then", value: priceWithUsage(pickedPlan) },
      ];
    case "keep":
    case "reactivate":
      return [
        {
          label: periodEnd ? `Until ${periodEnd}` : "This period",
          value: priceWithUsage(currentPlan),
        },
        {
          label: fromPeriodEnd,
          value: `${pricingPlans[after].name}, ${priceWithUsage(after)}`,
        },
      ];
    case "none":
      return [
        { label: "Price", value: priceWithUsage(currentPlan) },
        ...(periodEnd && current.monthlyPrice > 0
          ? [{ label: "Renews", value: periodEnd }]
          : []),
      ];
  }
}
