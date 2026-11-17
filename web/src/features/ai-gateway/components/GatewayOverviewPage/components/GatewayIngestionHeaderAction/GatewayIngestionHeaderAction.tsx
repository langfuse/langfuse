import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { IngestionDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionDialogController/IngestionDialogController";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GATEWAY_INGESTION_MODES } from "@/src/features/ai-gateway/constants/gatewayIngestionModes";

export type GatewayIngestionHeaderActionProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
};

/** Ingestion settings in the page header of Overview; managers only. */
export function GatewayIngestionHeaderAction({
  organizationId,
  projects,
}: GatewayIngestionHeaderActionProps) {
  const gatewayConfig = useGatewayConfig(organizationId);
  if (gatewayConfig.status !== "success") {
    return <Skeleton className="h-8 w-36" />;
  }

  const ingestionMode = GATEWAY_INGESTION_MODES.find(
    (mode) => mode.value === gatewayConfig.config?.ingestionMode,
  );

  return (
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
  );
}
