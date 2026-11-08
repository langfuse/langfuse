import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { IngestionDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionDialogController/IngestionDialogController";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GATEWAY_INGESTION_MODES } from "@/src/features/ai-gateway/constants/gatewayIngestionModes";

export type GatewayProvidersHeaderActionsProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
};

/** Ingestion settings and "Add provider" in the page header of the Providers tab; managers only. */
export function GatewayProvidersHeaderActions({
  organizationId,
  projects,
}: GatewayProvidersHeaderActionsProps) {
  const gatewayConfig = useGatewayConfig(organizationId);
  const config =
    gatewayConfig.status === "success" ? gatewayConfig.config : undefined;
  const ingestionMode = GATEWAY_INGESTION_MODES.find(
    (mode) => mode.value === config?.ingestionMode,
  );

  return (
    <div className="flex items-center gap-2">
      {gatewayConfig.status === "success" ? (
        <IngestionDialogController
          organizationId={organizationId}
          config={gatewayConfig.config}
          projects={projects.filter((project) => !project.deletedAt)}
        >
          {({ openDialog }) => (
            <Button variant="outline" onClick={openDialog}>
              {ingestionMode ? (
                <>
                  <ingestionMode.icon size="base" __rawClassName="mr-1.5" />
                  Ingestion: {ingestionMode.title}
                </>
              ) : (
                "Set up ingestion"
              )}
            </Button>
          )}
        </IngestionDialogController>
      ) : null}
      <ProviderDialogController
        organizationId={organizationId}
        surface="overview"
      >
        {({ openAddDialog }) => (
          <Button onClick={openAddDialog}>
            <Plus size="base" __rawClassName="mr-1.5" />
            Add provider
          </Button>
        )}
      </ProviderDialogController>
    </div>
  );
}
