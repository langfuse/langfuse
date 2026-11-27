import { ArrowRight } from "@langfuse/icons";

import { planLimitIcons } from "@/src/ee/features/billing/constants/planLimitIcons";
import { Button } from "@/src/components/design-system/Button/Button";
import { type PlanLimitChange } from "@/src/ee/features/billing/fns/planLimitChanges";
import { cn } from "@/src/utils/tailwind";

type PlanLimitsGridProps = {
  limits: ReadonlyArray<PlanLimitChange>;
  /** On a paid plan the units are an included amount: marks them "+ usage" and explains it below. */
  hasUsageFootnote: boolean;
};

const PRICING_CALCULATOR = "https://langfuse.com/pricing#pricing-calculator";

const directionClass = (direction: PlanLimitChange["direction"]): string => {
  switch (direction) {
    case "up":
      return "text-dark-green";
    case "down":
      return "text-destructive";
    case "same":
      return "text-foreground-secondary font-normal";
  }
};

/** Every plan limit in a three by two grid; a limit that changes shows what it was and what it becomes. */
export function PlanLimitsGrid({
  limits,
  hasUsageFootnote,
}: PlanLimitsGridProps) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-3">
        {limits.map((limit) => {
          const Icon = planLimitIcons[limit.kind];
          return (
            <li
              key={limit.kind}
              className="bg-modal flex min-w-0 flex-col gap-0.5 px-3 py-2"
            >
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Icon size="sm" aria-hidden />
                {limit.label}
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5 font-bold tabular-nums">
                {limit.direction !== "same" ? (
                  <>
                    <span className="text-muted-foreground font-normal">
                      {limit.was}
                    </span>
                    <span className="text-muted-foreground flex">
                      <ArrowRight size="sm" aria-hidden />
                    </span>
                  </>
                ) : null}
                <span
                  className={cn(
                    "whitespace-nowrap",
                    directionClass(limit.direction),
                  )}
                >
                  {limit.now}
                </span>
                {hasUsageFootnote && limit.kind === "units" ? (
                  <span className="text-muted-foreground text-xs font-normal whitespace-nowrap">
                    + usage<span aria-hidden>*</span>
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {hasUsageFootnote ? (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
          <span>
            <span aria-hidden>* </span>Extra units: $8 per 100k, less at volume.
          </span>
          <Button
            variant="text"
            size="sm"
            text="Estimate your usage"
            href={PRICING_CALCULATOR}
          />
        </p>
      ) : null}
    </div>
  );
}
