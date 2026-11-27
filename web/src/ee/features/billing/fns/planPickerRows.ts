import {
  type CloudPlan,
  cloudPlans,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { formatPlanPrice } from "@/src/ee/features/billing/fns/formatPlanPrice";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

export type PlanPickerRow = {
  plan: CloudPlan;
  name: string;
  tagline: string;
  price: string;
  isCurrent: boolean;
  /** Under the price: the difference to the current plan, or a date (it renews, it ends, a switch starts). */
  note: string | null;
  isNoteADate: boolean;
  isNoteAWarning: boolean;
};

const differenceTo = (plan: CloudPlan, currentPlan: CloudPlan): string => {
  const difference =
    pricingPlans[plan].monthlyPrice - pricingPlans[currentPlan].monthlyPrice;
  const sign = difference > 0 ? "+" : "−";
  return `${sign}$${Math.abs(difference).toLocaleString("en-US")} / month`;
};

/** The plans the picker lists, cheapest first. Hobby is listed only for an organization on it. */
export function planPickerRows(
  currentPlan: CloudPlan,
  subscription: Pick<
    PlanPickerSubscription,
    "pending" | "periodEnd" | "trialPlanName"
  >,
): ReadonlyArray<PlanPickerRow> {
  const { pending, periodEnd, trialPlanName } = subscription;
  const isFree = currentPlan === "cloud:hobby";

  return cloudPlans
    .filter((plan) => plan !== "cloud:hobby" || isFree)
    .map((plan) => {
      const isCurrent = plan === currentPlan && trialPlanName === null;
      const isScheduled = pending?.kind === "switch" && pending.to === plan;
      const isPaid = pricingPlans[plan].monthlyPrice > 0;
      const dateNote = (): string | null => {
        if (isScheduled) return periodEnd ? `Starts ${periodEnd}` : "Scheduled";
        if (!isCurrent || !isPaid || !periodEnd) return null;
        return pending ? `Ends ${periodEnd}` : `Renews ${periodEnd}`;
      };
      const date = dateNote();
      const difference =
        plan === currentPlan || isFree ? null : differenceTo(plan, currentPlan);
      return {
        plan,
        name: pricingPlans[plan].name,
        tagline: pricingPlans[plan].tagline,
        price: formatPlanPrice(plan),
        isCurrent,
        note: date ?? difference,
        isNoteADate: date !== null,
        isNoteAWarning: isScheduled || (isCurrent && pending !== null),
      };
    });
}
