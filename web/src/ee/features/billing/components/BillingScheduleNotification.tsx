// Langfuse Cloud only

import { InfoIcon } from "lucide-react";
import { useBillingInformation } from "./useBillingInformation";

export const BillingScheduleNotification = () => {
  const { planLabel, cancellation, scheduledPlanSwitch } =
    useBillingInformation();

  if (!scheduledPlanSwitch && !cancellation) {
    return null;
  }

  if (cancellation) {
    return (
      <div className="mb-4 mt-6 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current ltr:pr-4 rtl:pl-4">
        <div className="flex items-center gap-2 pl-3 leading-7">
          <InfoIcon className="h-4 w-4" />
          {`Your organization cancelled the subscription. Features of the ${planLabel} plan will be available until ${cancellation.formatted}.`}
        </div>
      </div>
    );
  }

  if (scheduledPlanSwitch) {
    return (
      <div className="mb-4 mt-6 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current ltr:pr-4 rtl:pl-4">
        <div className="flex gap-2 pl-3">
          <InfoIcon className="mt-1 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="leading-5">{`Your organization is scheduled to switch from ${planLabel} to ${scheduledPlanSwitch.newPlanLabel} on ${scheduledPlanSwitch.formatted}.`}</div>
            {scheduledPlanSwitch.message && (
              <div className="mt-2 leading-5 text-blue-800 dark:text-blue-300">
                {scheduledPlanSwitch.message}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
