import type { GatewayIngestionMode } from "@langfuse/shared";

import { Banner } from "@/src/components/design-system/Banner/Banner";

export type IngestionProjectAccessAlertProps = {
  ingestionMode: Exclude<GatewayIngestionMode, "NONE">;
};

/** Org members and viewers get implicit access to every project through their org role. */
export function IngestionProjectAccessAlert({
  ingestionMode,
}: IngestionProjectAccessAlertProps) {
  return (
    <Banner
      variant="warning"
      title="Everyone with project access sees gateway traffic"
    >
      Anyone who can open the ingestion project, including every organization
      member and viewer through their organization role, can see gateway
      requests, costs, and gateway key owners
      {ingestionMode === "FULL" ? ", plus the full prompts and responses" : ""}.
      Use a dedicated project and restrict who can access it.
    </Banner>
  );
}
