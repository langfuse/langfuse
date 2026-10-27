import { DEFAULT_GATEWAY_INGESTION_PROJECT_NAME } from "@/src/features/ai-gateway/constants/gatewayConfig";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export function getInitialIngestionSettings({
  config,
  projects,
}: {
  config: GatewayConfig | null;
  projects: GatewayProject[];
}): GatewayIngestionSettings {
  const existingProject = projects.find(
    (project) => project.id === config?.defaultIngestionProjectId,
  );
  return {
    ingestionMode: config?.ingestionMode ?? "USAGE",
    projectTarget: existingProject ? "existing" : "new",
    newProjectName: DEFAULT_GATEWAY_INGESTION_PROJECT_NAME,
    existingProjectId: existingProject?.id,
  };
}
