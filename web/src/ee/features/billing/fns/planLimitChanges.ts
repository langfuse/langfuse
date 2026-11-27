import {
  type CloudPlan,
  type PlanLimitKind,
  planLimitLabels,
  type PlanLimitValue,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { formatPlanLimit } from "@/src/ee/features/billing/fns/formatPlanLimit";

export type PlanLimitChange = {
  kind: PlanLimitKind;
  label: string;
  /** The limit on the plan the organization leaves. */
  was: string;
  /** The limit on the plan it moves to. */
  now: string;
  direction: "up" | "down" | "same";
};

const limitKinds = Object.keys(planLimitLabels) as PlanLimitKind[];

/** No limit and a per-customer limit both rank above any count. */
const rank = (value: PlanLimitValue): number =>
  typeof value === "number" ? value : Number.POSITIVE_INFINITY;

const directionOf = (
  was: PlanLimitValue,
  now: PlanLimitValue,
): PlanLimitChange["direction"] => {
  if (was === now) return "same";
  return rank(now) >= rank(was) ? "up" : "down";
};

/** Every limit on a move between two plans, changed or not, in the order they are shown. */
export function planLimitChanges(
  from: CloudPlan,
  to: CloudPlan,
): ReadonlyArray<PlanLimitChange> {
  return limitKinds.map((kind) => {
    const was = pricingPlans[from].limits[kind];
    const now = pricingPlans[to].limits[kind];
    return {
      kind,
      label: planLimitLabels[kind],
      was: formatPlanLimit(kind, was),
      now: formatPlanLimit(kind, now),
      direction: directionOf(was, now),
    };
  });
}
