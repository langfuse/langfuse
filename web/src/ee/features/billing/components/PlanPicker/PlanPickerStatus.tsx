import { CreditCard } from "@langfuse/icons";

import { Banner } from "@/src/components/design-system/Banner/Banner";

export type PlanPickerStatusValue =
  | { kind: "trial"; planName: string }
  | { kind: "cancel-scheduled"; planName: string; endsOn: string | null }
  | {
      kind: "switch-scheduled";
      planName: string;
      nextPlanName: string;
      startsOn: string | null;
    };

type PlanPickerStatusProps = { status: PlanPickerStatusValue };

const onDay = (day: string | null) =>
  day ? `on ${day}` : "at the end of this billing period";

/** The strip above the picker, shown only when something needs attention: a trial, or a change already scheduled. */
export function PlanPickerStatus({ status }: PlanPickerStatusProps) {
  switch (status.kind) {
    case "trial":
      return (
        <p className="bg-muted flex items-center gap-2 rounded-md px-3 py-2">
          <CreditCard size="sm" aria-hidden />
          <span>
            You are on the <span className="font-bold">{status.planName}</span>.
            Pick a plan to stay on paid features when it ends.
          </span>
        </p>
      );
    case "cancel-scheduled":
      return (
        <Banner variant="warning">
          {`${status.planName} ends ${onDay(status.endsOn)}. From then on you are on Hobby.`}
        </Banner>
      );
    case "switch-scheduled":
      return (
        <Banner variant="warning">
          {`${status.planName} ends ${onDay(status.startsOn)}. From then on you are on ${status.nextPlanName}.`}
        </Banner>
      );
  }
}
