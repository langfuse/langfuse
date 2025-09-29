// Langfuse Cloud only

import { Button } from "@/src/components/ui/button";
import Link from "next/link";

import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { StripeCustomerPortalButton } from "./StripeCustomerPortalButton";
import { BillingSwitchPlanDialog } from "./BillingSwitchPlanDialog";
import { useBillingInformation } from "./useBillingInformation";
import { StripeCancellationButton } from "./StripeCancellationButton";

export const BillingActionButtons = () => {
  const { organization } = useBillingInformation();
  const { setOpen } = useSupportDrawer();

  // Do not show checkout or customer portal if manual plan is set in cloud config
  if (organization?.cloudConfig?.plan) {
    return (
      <div className="mt-4 flex flex-row items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Change plan (via support)
        </Button>
        <Button variant="secondary" asChild>
          <Link href={"https://langfuse.com/pricing"} target="_blank">
            Compare plans
          </Link>
        </Button>
      </div>
    );
  }

  // Show pricing page button
  return (
    <div className="mt-4 flex flex-row items-center gap-2">
      {/* Always show – also for people who are currently on hobby plan */}
      <BillingSwitchPlanDialog />

      {organization?.cloudConfig?.stripe?.activeSubscriptionId && (
        <>
          <StripeCustomerPortalButton
            orgId={organization.id}
            title="Update Billing Details"
            variant="secondary"
          />
          <StripeCancellationButton
            orgId={organization.id}
            variant="secondary"
          />
        </>
      )}
      <Button variant="secondary" asChild>
        <Link href={"https://langfuse.com/pricing"} target="_blank">
          Compare plans
        </Link>
      </Button>
    </div>
  );
};
