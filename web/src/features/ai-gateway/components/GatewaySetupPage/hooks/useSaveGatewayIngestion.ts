import { useState } from "react";
import { useSession } from "next-auth/react";

import type { GatewayIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { api, reportNonTrpcError } from "@/src/utils/api";

/** Saves ingestion settings, creating the ingestion project first when a new one is named. */
export function useSaveGatewayIngestion(organizationId: string) {
  const session = useSession();
  const utils = api.useUtils();
  const createProject = api.projects.create.useMutation();
  const updateConfig = api.aiGateway.updateConfig.useMutation();
  // Spans every request and the refetch, so callers stay busy until the saved config is shown.
  const [isSaving, setIsSaving] = useState(false);

  async function resolveProjectId(settings: GatewayIngestionSettings) {
    if (settings.projectTarget === "existing") {
      return settings.existingProjectId ?? null;
    }
    // None keeps an already linked project but never creates one.
    if (settings.ingestionMode === "NONE") return null;
    const project = await createProject.mutateAsync({
      orgId: organizationId,
      name: settings.newProjectName.trim(),
    });
    // The organization's project list comes from the session.
    await session.update();
    return project.id;
  }

  async function saveIngestion(settings: GatewayIngestionSettings) {
    setIsSaving(true);
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
    } finally {
      setIsSaving(false);
    }
  }

  return {
    saveIngestion,
    isSaving,
  };
}
