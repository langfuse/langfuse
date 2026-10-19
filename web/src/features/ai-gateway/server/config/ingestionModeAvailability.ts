import { GatewayIngestionMode } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";

/** Langfuse Cloud always captures at least usage; NONE is self-hosted only. */
export function isGatewayIngestionModeAvailable(mode: GatewayIngestionMode) {
  return (
    mode !== GatewayIngestionMode.NONE || !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
  );
}

/** The mode to serve for a stored config, downgrading unavailable modes to USAGE. */
export function effectiveGatewayIngestionMode(mode: GatewayIngestionMode) {
  return isGatewayIngestionModeAvailable(mode)
    ? mode
    : GatewayIngestionMode.USAGE;
}
