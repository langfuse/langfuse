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
            We have made changes to our billing system that leads to a single
            potentially confusing invoice. Here is what we have changed on
            September 19th 2025 affecting invoices after that date:
          </div>
          <ol className="mb-2 ml-4 list-decimal space-y-1">
            <li>
              We now no longer charge the subscription base fee at the end of a
              month but at the beginning
            </li>
            <li>
              The Usage based fee is billed separately from the base fee at the
              end of a billing cycle
            </li>
            <li>We have reduced the price of the Core plan from $59 to $29</li>
            <li>
              Some users were on a <strong>legacy Pro</strong> plan which cost
              $59; those users were migrated from the legacy pro plan to the
              regular core plan; they were informed about this change some
              months ago
            </li>
          </ol>
          <div className="mb-2">
            <strong>What might be different on one invoice:</strong>
          </div>
          <ul className="mb-2 ml-4 list-disc space-y-1">
            <li>
              On the first invoice after the billing change on Sep 19th you will
              see 2 billing periods being charges, one that is billed at the end
              and one that is billed upfront
            </li>
            <li>
              Some users who previously saw &quot;Pro Plan&quot; on their
              invoice now see &quot;Core Plan&quot;
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
