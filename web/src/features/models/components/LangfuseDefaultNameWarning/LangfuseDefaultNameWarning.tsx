import { TriangleAlert } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";

export function LangfuseDefaultNameWarning() {
  return (
    <Alert variant="warning" size="sm" icon={TriangleAlert}>
      <Alert.Description>
        This replaces the Langfuse default for every project in this
        organization. Its extra pricing tiers and future Langfuse price updates
        won&apos;t apply.
      </Alert.Description>
    </Alert>
  );
}
