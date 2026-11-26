import { Check } from "@langfuse/icons";

import { PlanLossSummary } from "@/src/ee/features/billing/components/PlanLossSummary";

import { useCancellationSummary } from "./useCancellationSummary";

export function CancelSubscriptionConfirmStep() {
  const { planLabel, periodEnd, loss } = useCancellationSummary();
  const day = periodEnd ?? "the end of the billing period";

  return (
    <>
      <p>
        {planLabel} runs until {day}. After that this organization moves to the
        free Hobby plan.
      </p>

      {loss ? (
        <PlanLossSummary
          lost={loss.lost}
          limits={loss.limits}
          markers={loss.markers}
          targetLabel="Hobby"
        />
      ) : null}

      <p className="flex items-start gap-2">
        <Check size="base" __rawClassName="mt-0.5 shrink-0" aria-hidden />
        You keep projects, traces, prompts, datasets, API keys and every
        member&apos;s access.
      </p>

      <p className="text-muted-foreground text-xs">
        Usage until {day} is still billed under {planLabel}. You can reactivate
        any time before that date.
      </p>
    </>
  );
}
