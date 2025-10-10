// Langfuse Cloud only

import { InfoIcon } from "lucide-react";
import { useBillingInformation } from "./useBillingInformation";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";

export const BillingTransitionInfoCard = () => {
  const { organization } = useBillingInformation();
  const isCloudBillingAvailable = useIsCloudBillingAvailable();

  // Hide banner after November 20, 2025
  const cutoffDate = new Date("2025-11-20T00:00:00Z");
  const currentDate = new Date();
  const isBeforeCutoff = currentDate < cutoffDate;

  const shouldShowCard =
    isCloudBillingAvailable &&
    Boolean(organization?.cloudConfig?.stripe?.customerId) &&
    isBeforeCutoff;

  if (!shouldShowCard) {
    return null;
  }

  return (
    <div className="mb-4 mt-6 flex overflow-x-auto rounded-lg border border-blue-200 bg-blue-100 py-2 text-sm text-blue-900 contrast-more:border-current dark:border-blue-200/30 dark:bg-blue-900/30 dark:text-blue-200 contrast-more:dark:border-current ltr:pr-4 rtl:pl-4">
      <div className="flex gap-2 pl-3">
        <InfoIcon className="mt-1 h-4 w-4 flex-shrink-0" />
        <div className="leading-5">
          <div className="mb-2">
            <strong>Confused by Last Invoice?</strong>
          </div>
          <div className="mb-2">
            We made changes to our billing system on September 19th, 2025, which
            may result in one potentially confusing invoice.
          </div>
          <div className="mb-2">
            <strong>Here&apos;s what changed:</strong>
          </div>
          <ul className="mb-2 ml-4 list-disc space-y-1">
            <li>
              We now charge the subscription base fee at the beginning of each
              month instead of at the end
            </li>
            <li>
              Usage-based fees are billed separately from the base fee at the
              end of each billing cycle
            </li>
            <li>We reduced the Core plan price from $59 to $29</li>
            <li>
              Users on the legacy Pro plan ($59) were migrated to the regular
              Core plan; affected users were notified several months ago
            </li>
          </ul>
          <div className="mb-2">
            <strong>What might look different on your invoice:</strong>
          </div>
          <ul className="mb-2 ml-4 list-disc space-y-1">
            <li>
              Your first invoice after September 19th shows two billing
              periods—one billed at the end (old system) and one billed upfront
              (new system)
            </li>
            <li>
              Users who previously saw &quot;Pro Plan&quot; now see &quot;Core
              Plan&quot;
            </li>
          </ul>
          <div>
            For any questions reach out to{" "}
            <a
              href="mailto:finance@langfuse.com"
              className="underline hover:no-underline"
            >
              finance@langfuse.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
