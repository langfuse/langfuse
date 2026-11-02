import { useRef, useState } from "react";
import { useSession } from "next-auth/react";

import type { GatewayIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import type { GatewaySettingsSurface } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, reportNonTrpcError } from "@/src/utils/api";

/** Saves ingestion settings, creating the ingestion project first when a new one is named. */
export function useSaveGatewayIngestion(
  organizationId: string,
  surface: GatewaySettingsSurface,
) {
  const session = useSession();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const createProject = api.projects.create.useMutation();
  const updateConfig = api.aiGateway.updateConfig.useMutation();
  // Spans every request and the refetch, so callers stay busy until the saved config is shown.
  const [isSaving, setIsSaving] = useState(false);
  // A save can fail after creating the project; the retry must not create it again.
  const createdProjectRef = useRef<{ name: string; id: string } | null>(null);

  async function resolveProjectId(settings: GatewayIngestionSettings) {
    if (settings.projectTarget === "existing") {
      return settings.existingProjectId ?? null;
    }
    // None keeps an already linked project but never creates one.
    if (settings.ingestionMode === "NONE") return null;
    const name = settings.newProjectName.trim();
    if (createdProjectRef.current?.name === name) {
      return createdProjectRef.current.id;
    }
    const project = await createProject.mutateAsync({
      orgId: organizationId,
      name,
    });
    createdProjectRef.current = { name, id: project.id };
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
      capture("ai_gateway:ingestion_settings_saved", {
        orgId: organizationId,
        surface,
        ingestionMode: settings.ingestionMode,
        projectTarget: settings.projectTarget,
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
