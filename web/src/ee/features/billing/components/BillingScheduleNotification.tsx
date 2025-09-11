// Langfuse Cloud only

import { InfoIcon } from "lucide-react";
import { useBillingInformation } from "./useBillingInformation";

export const BillingScheduleNotification = () => {
  const { planLabel, cancellation, scheduledPlanSwitch } =
    useBillingInformation();

  if (!scheduledPlanSwitch && !cancellation) {
    return null;
  }

  if (scheduledPlanSwitch) {
    return (
      <div className="mb-4 mt-6 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current ltr:pr-4 rtl:pl-4">
        <div className="flex items-center gap-2 pl-3 leading-7">
          <InfoIcon className="h-4 w-4" />
          {`Your organization is scheduled to switch from ${planLabel} to ${scheduledPlanSwitch.newPlanLabel} by the end of the current billing period.`}
        </div>
      </div>
    );
  }

  if (cancellation) {
    return (
      <div className="mb-4 mt-6 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current ltr:pr-4 rtl:pl-4">
        <div className="flex items-center gap-2 pl-3 leading-7">
          <InfoIcon className="h-4 w-4" />
          {`Your organization cancelled the subscription. Features of the ${planLabel} plan will be available until the end of the billing period.`}
        </div>
      </div>
    );
  }

  return <div></div>;
};
