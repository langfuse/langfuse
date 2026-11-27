import { CalendarClock } from "@langfuse/icons";
import { useId } from "react";

import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { type CloudPlan } from "@/src/ee/features/billing/constants/pricingPlans";
import { type PlanPickerRow } from "@/src/ee/features/billing/fns/planPickerRows";
import { cn } from "@/src/utils/tailwind";

type PlanPickerListProps = {
  rows: ReadonlyArray<PlanPickerRow>;
  pickedPlan: CloudPlan;
  onPickPlan: (plan: CloudPlan) => void;
};

/** The plans as radio rows: name, who it is for, price and the difference to the current plan. */
export function PlanPickerList({
  rows,
  pickedPlan,
  onPickPlan,
}: PlanPickerListProps) {
  const idPrefix = useId();

  return (
    <RadioGroup
      value={pickedPlan}
      onValueChange={(value) => {
        const picked = rows.find((row) => row.plan === value);
        if (picked) onPickPlan(picked.plan);
      }}
    >
      {rows.map((row) => {
        const id = `${idPrefix}-${row.plan}`;
        return (
          <label
            key={row.plan}
            htmlFor={id}
            className={cn(
              "hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-3",
              row.plan === pickedPlan && "bg-accent border-border",
              row.isCurrent && "border-border",
            )}
          >
            <span className="flex pt-0.5">
              <RadioGroup.Item id={id} value={row.plan} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-bold">{row.name}</span>
              {row.isCurrent ? (
                <span className="text-dark-green text-xs font-bold">
                  Your current plan
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {row.tagline}
                </span>
              )}
            </span>
            <span className="flex flex-col items-end gap-0.5 tabular-nums">
              <span className="whitespace-nowrap">{row.price}</span>
              {row.note ? (
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs whitespace-nowrap",
                    row.isNoteAWarning
                      ? "text-dark-yellow"
                      : "text-muted-foreground",
                  )}
                >
                  {row.isNoteADate ? (
                    <CalendarClock size="sm" aria-hidden />
                  ) : null}
                  {row.note}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
