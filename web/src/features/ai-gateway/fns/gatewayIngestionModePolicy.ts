import type { GatewayIngestionMode } from "@langfuse/shared";

import { env } from "@/src/env.mjs";

const STORED_INGESTION_MODES = [
  "NONE",
  "USAGE",
  "FULL",
] as const satisfies readonly GatewayIngestionMode[];

/** Langfuse Cloud records a generation for every gateway request, so `NONE` is self-hosted only. */
export function isGatewayIngestionModeAvailable(mode: GatewayIngestionMode) {
  return mode !== "NONE" || !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
}

/**
 * The mode a stored config runs with. A `NONE` config stored on Cloud
 * captures usage, the minimal level, so no request goes unrecorded.
 */
export function getEffectiveGatewayIngestionMode(
  mode: GatewayIngestionMode,
): GatewayIngestionMode {
  return isGatewayIngestionModeAvailable(mode) ? mode : "USAGE";
}

/** Stored modes under which the gateway writes into the ingestion project. */
export function getCapturingGatewayIngestionModes() {
  return STORED_INGESTION_MODES.filter(
    (mode) => getEffectiveGatewayIngestionMode(mode) !== "NONE",
  );
}

export function getGatewayIngestionProjectDeletionMessage() {
  return isGatewayIngestionModeAvailable("NONE")
    ? "This project is used as the AI Gateway ingestion project. Select another ingestion project or set the ingestion mode to None before deleting it."
    : "This project is used as the AI Gateway ingestion project. Select another ingestion project before deleting it.";
}
