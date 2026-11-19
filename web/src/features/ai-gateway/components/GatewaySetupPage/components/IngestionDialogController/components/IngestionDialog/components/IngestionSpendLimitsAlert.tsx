import { AlertTriangle } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";

/** The gateway enforces no spend limits while ingestion records nothing. */
export function IngestionSpendLimitsAlert() {
  return (
    <Alert variant="warning" size="sm" icon={AlertTriangle}>
      <Alert.Title>Budgets stop applying</Alert.Title>
      <Alert.Description>
        <p>
          Gateway keys can spend without limit while nothing is recorded. Your
          budgets apply again once you turn ingestion back on.
        </p>
      </Alert.Description>
    </Alert>
  );
}
