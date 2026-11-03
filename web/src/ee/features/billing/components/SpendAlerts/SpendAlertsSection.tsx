import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Plus } from "@langfuse/icons";
import { ConnectedSpendAlertsTable } from "./ConnectedSpendAlertsTable";
import { ConnectedSpendAlertDialogController } from "./ConnectedSpendAlertDialogController";

interface SpendAlertsSectionProps {
  orgId: string;
}

export function SpendAlertsSection({ orgId }: SpendAlertsSectionProps) {
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  return (
    <ConnectedSpendAlertDialogController
      orgId={orgId}
      onSuccess={() => setRefetchTrigger((prev) => prev + 1)}
    >
      {({ openDialog }) => (
        <div className="space-y-2">
          <div className="flex items-center justify-between pt-4">
            <div>
              <h3 className="font-bold">Spend Alerts</h3>
              <p className="text-muted-foreground max-w-prose text-sm">
                Get notified when your organization&apos;s spending exceeds
                configured thresholds. Alerts may be delayed by up to 90
                minutes.
              </p>
              <p className="text-muted-foreground max-w-prose text-sm"></p>
            </div>

            <Button onClick={() => openDialog({ mode: "create" })}>
              <Plus size="base" __rawClassName="mr-2" />
              Create Alert
            </Button>
          </div>

          <ConnectedSpendAlertsTable orgId={orgId} key={refetchTrigger} />
        </div>
      )}
    </ConnectedSpendAlertDialogController>
  );
}
