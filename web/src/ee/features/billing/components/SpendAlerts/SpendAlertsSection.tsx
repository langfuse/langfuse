import { useState } from "react";
import { Button } from "@/src/components/ui/button";
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
    return null;
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between pt-4">
          <div>
            <h3 className="text-large font-medium">Spend Alerts</h3>
            <p className="max-w-prose text-sm text-muted-foreground">
              Get notified when your organization&apos;s spending exceeds
              configured thresholds. Alerts may be delayed by up to 90 minutes.
            </p>
            <p className="max-w-prose text-sm text-muted-foreground"></p>
          </div>

          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Alert
          </Button>
        </div>

        <SpendAlertsTable orgId={orgId} key={refetchTrigger} />
      </div>

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
