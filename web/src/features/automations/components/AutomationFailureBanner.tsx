import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { api } from "@/src/utils/api";

interface AutomationFailureBannerProps {
  projectId: string;
  automationId: string;
}

export const AutomationFailureBanner: React.FC<
  AutomationFailureBannerProps
> = ({ projectId, automationId }) => {
  const [dismissed, setDismissed] = React.useState(false);

  const { data: failureData } =
    api.automations.getCountOfConsecutiveFailures.useQuery({
      projectId,
      automationId,
    });

  if (dismissed || !failureData || failureData.count < 5) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex-1">
          <strong>
            This automation was automatically disabled due to at least{" "}
            {failureData.count} consecutive webhook failures.
          </strong>
          <div className="mt-2 text-sm">
            Check the execution history below, fix any issues with your webhook
            endpoint, then reactivate the automation.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className="ml-4 h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
};
