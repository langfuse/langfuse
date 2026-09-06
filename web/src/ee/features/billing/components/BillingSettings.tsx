/* eslint-disable @repo/no-null-render */
// Langfuse Cloud only

import { useHasOrganizationAccess } from "@/src/features/rbac";
import Header from "@/src/components/layouts/header";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useRouter } from "next/router";
import { Alert } from "@/src/components/design-system/Alert/Alert";

import { BillingUsageChart } from "./BillingUsageChart";
import { BillingActionButtons } from "./BillingActionButtons";
import { BillingScheduleNotification } from "./BillingScheduleNotification";
import { BillingInvoiceTable } from "./BillingInvoiceTable";
import { BillingDiscountView } from "./BillingDiscountView";
import { BillingPlanPeriodView } from "@/src/ee/features/billing/components/BillingPlanPeriodView";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { SpendAlertsSection } from "./SpendAlerts/SpendAlertsSection";
import { useBillingInformation } from "./useBillingInformation";
import { useTranslations } from "next-intl";

export const BillingSettings = () => {
  const t = useTranslations("settingsEnterprise.billing.settings");
  const router = useRouter();
  const orgId = router.query.organizationId as string | undefined;
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const isCloudBillingAvailable = useIsCloudBillingAvailable();
  const isCloudBillingEntitled = useHasEntitlement("cloud-billing");
  const isSpendAlertEntitled = useHasEntitlement("cloud-spend-alerts");
  const { organization, billingProvider, hasActiveSubscription } =
    useBillingInformation();
  const showBillingDiscount = Boolean(
    organization?.cloudConfig?.stripe?.activeSubscriptionId &&
    billingProvider !== "clickhouse",
  );

  // Don't render billing settings if cloud billing is not available
  if (!isCloudBillingAvailable) {
    return null;
  }

  // Handle conditional rendering without early returns
  if (!isCloudBillingEntitled) {
    return null;
  }

  if (!hasAccess) {
    return (
      <Alert>
        <Alert.Title>{t("accessDenied")}</Alert.Title>
        <Alert.Description>{t("accessDeniedDescription")}</Alert.Description>
      </Alert>
    );
  }

  return (
    <div>
      <BillingScheduleNotification />

      <Header title={t("title")} />
      <div className="space-y-6">
        <BillingUsageChart />
        <BillingPlanPeriodView />
        {showBillingDiscount && organization && (
          <BillingDiscountView
            orgId={organization.id}
            hasStripeCustomer={Boolean(
              organization.cloudConfig?.stripe?.customerId,
            )}
          />
        )}
        <BillingActionButtons />
        <BillingInvoiceTable />
        {isSpendAlertEntitled && orgId && hasActiveSubscription && (
          <SpendAlertsSection orgId={orgId} />
        )}
      </div>
    </div>
  );
};
