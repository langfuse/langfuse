import {
  type CloudPlan,
  cloudPlans,
  type PlanLine,
  type PlanLineKind,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";

export type PlanLineChanges = {
  /** The lines of the higher of the two plans. */
  own: ReadonlyArray<PlanLine>;
  /** That plan's name. */
  ownFrom: string;
  /** Lines of the plans in between, highest plan first. */
  inherited: ReadonlyArray<PlanLine>;
  inheritedFrom: ReadonlyArray<string>;
};

const NO_CHANGES: PlanLineChanges = {
  own: [],
  ownFrom: "",
  inherited: [],
  inheritedFrom: [],
};

/**
 * The feature lines a move between two plans gains (to a higher plan) or
 * loses (to a lower one). Each kind is said once: a lower plan's line is left
 * out when a higher plan in the move has one of that kind, and on a downgrade
 * to a paid plan when the target keeps one. Hobby's "with limits" line is
 * never a gain.
 */
export function planLineChanges(
  from: CloudPlan,
  to: CloudPlan,
): PlanLineChanges {
  const fromIndex = cloudPlans.indexOf(from);
  const toIndex = cloudPlans.indexOf(to);
  if (fromIndex === toIndex) return NO_CHANGES;

  const isUpgrade = toIndex > fromIndex;
  const lowIndex = Math.min(fromIndex, toIndex);
  const highIndex = Math.max(fromIndex, toIndex);
  const highest = cloudPlans[highIndex];
  if (highest === undefined) return NO_CHANGES;

  const own = pricingPlans[highest].lines;
  const said = new Set<PlanLineKind>(own.map((line) => line.kind));
  if (isUpgrade) said.add("platform");
  if (!isUpgrade && to !== "cloud:hobby") {
    cloudPlans
      .slice(0, toIndex + 1)
      .flatMap((plan) => pricingPlans[plan].lines)
      .forEach((line) => said.add(line.kind));
  }

  const inherited: PlanLine[] = [];
  const inheritedFrom: string[] = [];
  for (const plan of cloudPlans.slice(lowIndex + 1, highIndex).reverse()) {
    const added = pricingPlans[plan].lines.filter(
      (line) => !said.has(line.kind),
    );
    if (added.length === 0) continue;
    added.forEach((line) => said.add(line.kind));
    inherited.push(...added);
    inheritedFrom.push(pricingPlans[plan].name);
  }

  return { own, ownFrom: pricingPlans[highest].name, inherited, inheritedFrom };
}
