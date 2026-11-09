import type { GatewayIngestionMode } from "@langfuse/shared";

import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

const INGESTION_SUMMARIES: Record<GatewayIngestionMode, string> = {
  NONE: "Not recording gateway traffic",
  USAGE: "Recording usage only",
  FULL: "Recording full requests and responses",
};

/** One-line summary of a saved config, e.g. `Recording usage only in project "ai-gateway"`. */
export function describeGatewayIngestion({
  config,
  projects,
}: {
  config: GatewayConfig;
  projects: GatewayProject[];
}) {
  const summary = INGESTION_SUMMARIES[config.ingestionMode];
  const project = projects.find(
    (candidate) => candidate.id === config.defaultIngestionProjectId,
  );
  if (config.ingestionMode === "NONE" || !project) return summary;
  return `${summary} in project "${project.name}"`;
}
