import { useSession } from "next-auth/react";

import type { GatewayIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { api, reportNonTrpcError } from "@/src/utils/api";

/** Saves ingestion settings, creating the ingestion project first when a new one is named. */
export function useSaveGatewayIngestion(organizationId: string) {
  const session = useSession();
  const utils = api.useUtils();
  const createProject = api.projects.create.useMutation();
  const updateConfig = api.aiGateway.updateConfig.useMutation();

  async function resolveProjectId(settings: GatewayIngestionSettings) {
    if (settings.ingestionMode === "NONE") return null;
    if (settings.projectTarget === "existing") {
      return settings.existingProjectId ?? null;
    }
    const project = await createProject.mutateAsync({
      orgId: organizationId,
      name: settings.newProjectName.trim(),
    });
    // The organization's project list comes from the session.
    await session.update();
    return project.id;
  }

  async function saveIngestion(settings: GatewayIngestionSettings) {
    try {
      await updateConfig.mutateAsync({
        orgId: organizationId,
        defaultIngestionProjectId: await resolveProjectId(settings),
        ingestionMode: settings.ingestionMode,
      });
      await Promise.all([
        utils.aiGateway.getConfig.invalidate({ orgId: organizationId }),
        utils.aiGateway.getSetupStatus.invalidate({ orgId: organizationId }),
      ]);
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-configuration");
      return false;
    }
  }

  return {
    saveIngestion,
    isSaving: createProject.isPending || updateConfig.isPending,
  };
}
