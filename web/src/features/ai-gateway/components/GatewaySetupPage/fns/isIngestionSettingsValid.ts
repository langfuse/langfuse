import type { GatewayIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export function isIngestionSettingsValid(settings: GatewayIngestionSettings) {
  if (settings.ingestionMode === "NONE") return true;
  if (settings.projectTarget === "new") {
    return settings.newProjectName.trim().length > 0;
  }
  return settings.existingProjectId !== undefined;
}
