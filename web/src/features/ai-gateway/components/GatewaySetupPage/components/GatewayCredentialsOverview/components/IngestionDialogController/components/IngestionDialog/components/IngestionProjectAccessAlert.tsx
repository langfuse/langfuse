import { AlertTriangle } from "@langfuse/icons";
import type { GatewayIngestionMode } from "@langfuse/shared";

import { Alert } from "@/src/components/design-system/Alert/Alert";

export type IngestionProjectAccessAlertProps = {
  ingestionMode: Exclude<GatewayIngestionMode, "NONE">;
};

/** Org members and viewers get implicit access to every project through their org role. */
export function IngestionProjectAccessAlert({
  ingestionMode,
}: IngestionProjectAccessAlertProps) {
  return (
    <Alert variant="warning" size="sm" icon={AlertTriangle}>
      <Alert.Title>
        Everyone with project access sees gateway traffic
      </Alert.Title>
      <Alert.Description>
        <p>
          Anyone who can open the ingestion project, including every
          organization member and viewer through their organization role, can
          see gateway requests, costs, and gateway key owners
          {ingestionMode === "FULL"
            ? ", plus the full prompts and responses"
            : ""}
          . Use a dedicated project and restrict who can access it.
        </p>
      </Alert.Description>
    </Alert>
  );
}
