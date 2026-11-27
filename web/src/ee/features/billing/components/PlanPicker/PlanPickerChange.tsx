import { useId, useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import {
  type CloudPlan,
  cloudPlans,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { planIncludedLines } from "@/src/ee/features/billing/fns/planIncludedLines";
import {
  type PlanLimitChange,
  planLimitChanges,
} from "@/src/ee/features/billing/fns/planLimitChanges";
import { planLineChanges } from "@/src/ee/features/billing/fns/planLineChanges";

import { PlanLimitsGrid } from "./PlanLimitsGrid";
import { PlanLinesList } from "./PlanLinesList";

type PlanPickerChangeProps = {
  currentPlan: CloudPlan;
  pickedPlan: CloudPlan;
  /** One sentence when the pick would undo or replace something already scheduled. */
  pendingNote: string | null;
};

const limitsHeading = (
  isCurrent: boolean,
  isUpgrade: boolean,
  limits: ReadonlyArray<PlanLimitChange>,
): string => {
  if (isCurrent) return "Your limits";
  if (limits.every((limit) => limit.direction === "same"))
    return "Limits stay the same";
  return isUpgrade ? "Higher limits" : "Lower limits";
};

/** What picking a plan changes: its limits against the current plan's, and the features gained or lost. */
export function PlanPickerChange({
  currentPlan,
  pickedPlan,
  pendingNote,
}: PlanPickerChangeProps) {
  const picked = pricingPlans[pickedPlan];
  const isCurrent = pickedPlan === currentPlan;
  const isUpgrade =
    cloudPlans.indexOf(pickedPlan) > cloudPlans.indexOf(currentPlan);
  const limits = planLimitChanges(currentPlan, pickedPlan);
  const lines = planLineChanges(currentPlan, pickedPlan);
  // Generic on purpose: the lines say what they are, the plan names only add length.
  const inheritedLabel = isUpgrade
    ? `Also included, from previous plans (${lines.inherited.length})`
    : `You also lose, from the plans in between (${lines.inherited.length})`;
  // Open for one picked plan only: picking another plan closes it again.
  const [inheritedShownFor, setInheritedShownFor] = useState<CloudPlan | null>(
    null,
  );
  const isInheritedShown = inheritedShownFor === pickedPlan;
  const inheritedId = useId();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h3 className="text-lg leading-tight font-bold">{picked.name}</h3>
            <Button
              variant="text"
              size="sm"
              text="Learn more"
              href="https://langfuse.com/pricing"
            />
          </div>
          <p className="text-muted-foreground">{picked.description}</p>
        </div>

        {pendingNote ? <p className="border-l-2 pl-3">{pendingNote}</p> : null}

        <section className="flex flex-col gap-2">
          <h4 className="text-muted-foreground text-xs font-bold">
            {limitsHeading(isCurrent, isUpgrade, limits)}
          </h4>
          <PlanLimitsGrid
            limits={limits}
            hasUsageFootnote={picked.monthlyPrice > 0}
          />
        </section>
      </div>

      {isCurrent ? (
        <section className="mt-auto flex flex-col gap-2 border-t p-5">
          <h4 className="text-muted-foreground text-xs font-bold">
            Also included
          </h4>
          <PlanLinesList lines={planIncludedLines(pickedPlan)} isLoss={false} />
        </section>
      ) : (
        <section className="mt-auto flex flex-col gap-2 border-t p-5">
          <h4 className="text-muted-foreground text-xs font-bold">
            {isUpgrade
              ? `Everything in ${pricingPlans[currentPlan].name}, plus`
              : `You lose these ${lines.ownFrom} features`}
          </h4>
          <PlanLinesList lines={lines.own} isLoss={!isUpgrade} />
          {lines.inherited.length > 0 ? (
            <div className="flex flex-col items-start gap-2">
              <ExpandToggle
                variant="icon"
                size="sm"
                expanded={isInheritedShown}
                onExpandedChange={(expanded) =>
                  setInheritedShownFor(expanded ? pickedPlan : null)
                }
                label={inheritedLabel}
                expandedLabel={inheritedLabel}
                controls={inheritedId}
              />
              {isInheritedShown ? (
                <div id={inheritedId} className="w-full">
                  <PlanLinesList lines={lines.inherited} isLoss={!isUpgrade} />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
