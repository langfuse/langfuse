// Langfuse Cloud only

import { useMemo } from "react";

import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useQueryOrganization } from "@/src/features/organizations/hooks";

import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { StripeCustomerPortalButton } from "./StripeCustomerPortalButton";
import { BillingSwitchPlanDialog } from "./BillingSwitchPlanDialog";

export const BillingActionButtons = () => {
  const organization = useQueryOrganization();
  const { setOpen } = useSupportDrawer();

  const scheduledForCancellationDate = useMemo(() => {
    const cancellationInfo =
      organization?.cloudConfig?.stripe?.cancellationInfo;

    if (!cancellationInfo) {
      return null;
    }

    if (!cancellationInfo.scheduledForCancellation) {
      return null;
    }

    if (!cancellationInfo.cancelAt) {
      return null;
    }

    try {
      const cancelAt = cancellationInfo.cancelAt;
      const cancelAtDate =
        typeof cancelAt === "number" && !Number.isNaN(cancelAt)
          ? new Date(cancelAt * 1000)
          : undefined;

      const inFuture = cancelAtDate
        ? cancelAtDate.getTime() > Date.now()
        : false;

      if (inFuture) {
        return cancelAtDate;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }, [organization]);

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
            variant="default"
          />
          <StripeCustomerPortalButton
            orgId={organization.id}
            title={
              scheduledForCancellationDate
                ? "Reactivate Subscription"
                : "Cancel Subscription"
            }
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
