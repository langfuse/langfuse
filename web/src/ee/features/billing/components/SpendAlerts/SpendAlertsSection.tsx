import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Plus } from "lucide-react";
import { SpendAlertsTable } from "./SpendAlertsTable";
import { SpendAlertDialog } from "./SpendAlertDialog";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

interface SpendAlertsSectionProps {
  orgId: string;
}

export function SpendAlertsSection({ orgId }: SpendAlertsSectionProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const hasEntitlement = useHasEntitlement("cloud-spend-alerts");

  if (!hasEntitlement) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spend Alerts</CardTitle>
          <CardDescription>
            Spend alerts are available on paid plans. Upgrade your plan to get
            notified when your spending exceeds configured thresholds.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spend Alerts</CardTitle>
          <CardDescription>
            Only organization owners can configure spend alerts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Spend Alerts</CardTitle>
            <CardDescription>
              Get notified when your organization's spending exceeds configured
              thresholds. Alerts are sent to organization owners and admins.
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Alert
          </Button>
        </CardHeader>
        <CardContent>
          <SpendAlertsTable
            orgId={orgId}
            key={refetchTrigger} // Force refetch when needed
          />
        </CardContent>
      </Card>

      <SpendAlertDialog
        orgId={orgId}
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={() => {
          setIsCreateDialogOpen(false);
          setRefetchTrigger((prev) => prev + 1); // Trigger refetch
        }}
      />
    </>
  );
}
