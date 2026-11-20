import { TriangleAlert } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";

export function LangfuseDefaultNameWarning() {
  return (
    <Alert variant="warning" size="sm" icon={TriangleAlert}>
      <Alert.Description>
        This replaces the Langfuse default for every project in this
        organization. Only the pricing tiers defined here apply, and future
        Langfuse price updates won&apos;t.
      </Alert.Description>
    </Alert>
  );
}
