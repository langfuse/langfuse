import {
  type CloudPlan,
  type PlanLimitKind,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { numberFormatter } from "@/src/utils/numbers";

export type OverLimitMarkers = Partial<Record<PlanLimitKind, string>>;

const isOver = (used: number | undefined, limit: unknown): used is number =>
  used !== undefined && typeof limit === "number" && used > limit;

/**
 * The limits of `target` the organization is over today, each with a few
 * words to show beside it. Units count only on Hobby, where they are a cap;
 * on a paid plan they are the included amount.
 */
export function overLimitMarkers(
  target: CloudPlan,
  usage: {
    memberCount?: number | undefined;
    unitsThisPeriod?: number | undefined;
  },
): OverLimitMarkers {
  const { limits } = pricingPlans[target];
  const isUnitsCapped = target === "cloud:hobby";
  return {
    ...(isOver(usage.memberCount, limits.users)
      ? { users: `You have ${usage.memberCount}` }
      : {}),
    ...(isUnitsCapped && isOver(usage.unitsThisPeriod, limits.units)
      ? { units: `You sent ${numberFormatter(usage.unitsThisPeriod, 0)}` }
      : {}),
  };
}
