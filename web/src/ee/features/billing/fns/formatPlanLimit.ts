import {
  type PlanLimitKind,
  type PlanLimitValue,
} from "@/src/ee/features/billing/constants/pricingPlans";

const DAYS_IN_YEAR = 365;

const formatCount = (kind: PlanLimitKind, count: number): string => {
  switch (kind) {
    case "units":
      return `${count / 1000}k`;
    case "data-access":
      return count < DAYS_IN_YEAR
        ? `${count} days`
        : `${count / DAYS_IN_YEAR} years`;
    case "ingestion":
      return `${count.toLocaleString("en-US")} / min`;
    case "users":
    case "annotation-queues":
    case "alerts":
      return String(count);
  }
};

/** A plan limit as the pricing page prints it: "50k", "3 years", "1,000 / min", "Unlimited". */
export function formatPlanLimit(
  kind: PlanLimitKind,
  value: PlanLimitValue,
): string {
  switch (value) {
    case "unlimited":
      return "Unlimited";
    case "custom":
      return "Custom";
    default:
      return formatCount(kind, value);
  }
}
