// Langfuse Cloud only

import Header from "@/src/components/layouts/header";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useRouter } from "next/router";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

import { BillingUsageChart } from "./BillingUsageChart";
import { BillingActionButtons } from "./BillingActionButtons";
import { BillingScheduleNotification } from "./BillingScheduleNotification";
import { BillingInvoiceTable } from "./BillingInvoiceTable";
import { BillingDiscountView } from "./BillingDiscountView";
import { BillingPlanPeriodView } from "@/src/ee/features/billing/components/BillingPlanPeriodView";
import { SpendAlertsSection } from "./SpendAlerts/SpendAlertsSection";

export const BillingSettings = () => {
  const router = useRouter();
  const orgId = router.query.organizationId as string | undefined;
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const entitled = useHasEntitlement("cloud-billing");
  const isSpendAlertEntitled = useHasEntitlement("cloud-spend-alerts");

  // Handle conditional rendering without early returns
  if (!entitled) {
    return null;
  }

  if (!hasAccess) {
    return (
      <Alert>
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You do not have permission to view the billing settings of this
          organization.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div>
      <BillingScheduleNotification />

      <Header title="Usage & Billing" />
      <div className="space-y-6">
        <BillingUsageChart />
        <BillingPlanPeriodView />
        <BillingDiscountView />
        <BillingActionButtons />
        <BillingInvoiceTable />
        {isSpendAlertEntitled && orgId && <SpendAlertsSection orgId={orgId} />}
      </div>
    </div>
  );
};
