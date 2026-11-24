// Langfuse Cloud only

import { Banner } from "@/src/components/design-system/Banner/Banner";
import type { UseBillingInformationResult } from "./useBillingInformation";

type BillingScheduleNotificationProps =
  | {
      type: "cancellation";
      planLabel: string;
      cancellation: NonNullable<UseBillingInformationResult["cancellation"]>;
    }
  | {
      type: "scheduled-plan-switch";
      planLabel: string;
      scheduledPlanSwitch: NonNullable<
        UseBillingInformationResult["scheduledPlanSwitch"]
      >;
    };

export const BillingScheduleNotification = (
  props: BillingScheduleNotificationProps,
) => {
  if (props.type === "cancellation") {
    return (
      <div className="mt-6 mb-4">
        <Banner variant="info">
          {`Your organization cancelled the subscription. Features of the ${props.planLabel} plan will be available until ${props.cancellation.formatted}.`}
        </Banner>
      </div>
    );
  }

  return (
    <div className="mt-6 mb-4">
      <Banner variant="info">
        {`Your organization is scheduled to switch from ${props.planLabel} to ${props.scheduledPlanSwitch.newPlanLabel} on ${props.scheduledPlanSwitch.formatted}.`}
        {props.scheduledPlanSwitch.message && (
          <div className="mt-2">{props.scheduledPlanSwitch.message}</div>
        )}
      </Banner>
    </div>
  );
};
