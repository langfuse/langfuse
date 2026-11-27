import { type CloudPlan } from "@/src/ee/features/billing/constants/pricingPlans";

/** What the plan picker needs to know about the organization's subscription. */
export type PlanPickerSubscription = {
  /** False for an organization that pays nothing yet: it buys a plan through checkout. */
  hasSubscription: boolean;
  /** A legacy subscription is replaced at once, with an invoice today, in either direction. */
  isLegacy: boolean;
  hasValidPaymentMethod: boolean;
  /** The day the billing period ends, as shown to the customer. */
  periodEnd: string | null;
  /** Set for an organization on a trial: it has no plan of its own yet and is compared from the free plan. */
  trialPlanName: string | null;
  /** A cancellation or a plan switch already scheduled for the period end. */
  pending: { kind: "cancel" } | { kind: "switch"; to: CloudPlan } | null;
};
