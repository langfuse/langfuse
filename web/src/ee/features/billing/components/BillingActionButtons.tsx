// Langfuse Cloud only
import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";

import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { StripeCustomerPortalButton } from "./StripeCustomerPortalButton";
import { BillingSwitchPlanDialog } from "./BillingSwitchPlanDialog";
import { useBillingInformation } from "./useBillingInformation";
import { StripeCancellationButton } from "./StripeCancellationButton";
import { useTranslations } from "next-intl";

export const BillingActionButtons = () => {
  const t = useTranslations("settingsEnterprise.billing");
  const {
    organization,
    hasActiveSubscription,
    hasValidPaymentMethod,
    isLoading,
  } = useBillingInformation();
  const { setOpen } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();

  // Show pricing page button
  const shouldDisableChangePlan = useMemo(() => {
    if (!hasActiveSubscription) {
      return false; // always show for hobby plan users
    }
    return !hasValidPaymentMethod;
  }, [hasActiveSubscription, hasValidPaymentMethod]);

  // Do not show checkout or customer portal if manual plan is set in cloud config
  if (organization?.cloudConfig?.plan) {
    return (
      <div className="mt-4 flex flex-row items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setMigrationPanelOpen(false);
            setOpen(true);
          }}
        >
          {t("plan.changeViaSupport")}
        </Button>
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/pricing" target="_blank">
            {t("common.comparePlans")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        {/* Always show – also for people who are currently on hobby plan */}
        <BillingSwitchPlanDialog disabled={shouldDisableChangePlan} />

        {organization && hasActiveSubscription && (
          <>
            <StripeCustomerPortalButton
              orgId={organization.id}
              title={t("common.updateBillingDetails")}
              variant="secondary"
            />
            <StripeCancellationButton
              orgId={organization.id}
              variant="secondary"
            />
          </>
        )}
        <Button variant="secondary" asChild>
          <Link href="https://langfuse.com/pricing" target="_blank">
            {t("common.comparePlans")}
          </Link>
        </Button>
      </div>
      {hasActiveSubscription && !hasValidPaymentMethod && !isLoading && (
        <p className="text-sm text-red-600">{t("plan.invalidPaymentMethod")}</p>
      )}
    </div>
  );
};
