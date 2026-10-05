import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import { SpendAlertsTable } from "./SpendAlertsTable";
import { SpendAlertDialog } from "./SpendAlertDialog";

interface SpendAlertsSectionProps {
  orgId: string;
}

export function SpendAlertsSection({ orgId }: SpendAlertsSectionProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between pt-4">
          <div>
            <h3 className="font-bold">Spend Alerts</h3>
            <p className="text-muted-foreground max-w-prose text-sm">
              Get notified when your organization&apos;s spending exceeds
              configured thresholds. Alerts may be delayed by up to 90 minutes.
            </p>
            <p className="text-muted-foreground max-w-prose text-sm"></p>
          </div>

          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="icon-base mr-2" />
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
