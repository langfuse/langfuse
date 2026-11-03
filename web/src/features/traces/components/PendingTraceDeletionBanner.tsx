import { AlertTriangle } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";

export function PendingTraceDeletionBanner() {
  return (
    <Alert variant="warning" icon={AlertTriangle}>
      <Alert.Description>
        This trace is scheduled for deletion and may take up to 24 hours.
      </Alert.Description>
    </Alert>
  );
}
