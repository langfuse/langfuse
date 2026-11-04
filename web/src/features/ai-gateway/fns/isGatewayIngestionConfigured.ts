import type { GatewayIngestionMode } from "@langfuse/shared";

/** Capturing ingestion modes need a project to record into; `NONE` does not. */
export function isGatewayIngestionConfigured({
  ingestionMode,
  hasActiveIngestionProject,
}: {
  ingestionMode: GatewayIngestionMode;
  hasActiveIngestionProject: boolean;
}) {
  return ingestionMode === "NONE" || hasActiveIngestionProject;
}
