// Langfuse Cloud only

import { InfoIcon } from "lucide-react";
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
      <div className="mt-6 mb-4 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current ltr:pr-4 rtl:pl-4 dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current">
        <div className="flex items-center gap-2 pl-3 leading-7">
          <InfoIcon className="h-4 w-4" />
          {`Your organization cancelled the subscription. Features of the ${props.planLabel} plan will be available until ${props.cancellation.formatted}.`}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 mb-4 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current ltr:pr-4 rtl:pl-4 dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current">
      <div className="flex gap-2 pl-3">
        <InfoIcon className="mt-1 h-4 w-4 shrink-0" />
        <div>
          <div className="leading-5">{`Your organization is scheduled to switch from ${props.planLabel} to ${props.scheduledPlanSwitch.newPlanLabel} on ${props.scheduledPlanSwitch.formatted}.`}</div>
          {props.scheduledPlanSwitch.message && (
            <div className="mt-2 leading-5 text-blue-800 dark:text-blue-300">
              {props.scheduledPlanSwitch.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
