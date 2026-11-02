import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { IngestionDialog } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/components/IngestionDialogController/components/IngestionDialog/IngestionDialog";
import { useSaveGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useSaveGatewayIngestion";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { showSuccessToast } from "@/src/features/notifications";

export type IngestionDialogControllerProps = {
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  children: (control: { openDialog: () => void }) => ReactNode;
};

export function IngestionDialogController({
  organizationId,
  config,
  projects,
  children,
}: IngestionDialogControllerProps) {
  const { saveIngestion, isSaving } = useSaveGatewayIngestion(
    organizationId,
    "overview",
  );

  async function handleSave(settings: GatewayIngestionSettings) {
    const isSaved = await saveIngestion(settings);
    if (isSaved) {
      showSuccessToast({
        operation: "aiGateway.updateConfig",
        title: "Ingestion settings saved",
        description: "New gateway requests use these settings.",
      });
    }
    return isSaved;
  }

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <IngestionDialog
          config={config}
          projects={projects}
          isSaving={isSaving}
          onSave={handleSave}
          onSaved={closeDialog}
        />
      )}
    >
      {children}
    </DialogController>
  );
}
