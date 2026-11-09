import { isGatewayIngestionConfigured } from "@/src/features/ai-gateway/fns/isGatewayIngestionConfigured";
import type { GatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export function isGatewayConfigComplete(config: GatewayConfig | null) {
  if (!config) return false;
  const project = config.defaultIngestionProject;
  return isGatewayIngestionConfigured({
    ingestionMode: config.ingestionMode,
    hasActiveIngestionProject: project !== null && !project.deletedAt,
  });
}
