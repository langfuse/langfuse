// Langfuse Cloud only

import Header from "@/src/components/layouts/header";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useRouter } from "next/router";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

import { UsageAlerts } from "./UsageAlerts";
import { BillingUsageChart } from "./BillingUsageChart";
import { BillingActionButtons } from "./BillingActionButtons";
import { BillingScheduleNotification } from "./BillingScheduleNotification";
import { BillingInvoiceTable } from "./BillingInvoiceTable";
import { useBillingInformation } from "./useBillingInformation";

export const BillingSettings = () => {
  const router = useRouter();
  const orgId = router.query.organizationId as string | undefined;
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const entitled = useHasEntitlement("cloud-billing");
  const isUsageAlertEntitled = useHasEntitlement("cloud-usage-alerts");
  const billingInfo = useBillingInformation();
  if (!entitled) return null;

  if (!hasAccess)
    return (
      <Alert>
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You do not have permission to view the billing settings of this
          organization.
        </AlertDescription>
      </Alert>
    );

  return (
    <div>
      <BillingScheduleNotification />

      <Header title="Usage & Billing" />
      <div className="space-y-6">
        <BillingUsageChart />
        <BillingActionButtons />
        {isUsageAlertEntitled && orgId && <UsageAlerts orgId={orgId} />}
        {orgId && billingInfo.hasActiveSubscription && (
          <BillingInvoiceTable orgId={orgId} />
        )}
      </div>
    </div>
  );
};
