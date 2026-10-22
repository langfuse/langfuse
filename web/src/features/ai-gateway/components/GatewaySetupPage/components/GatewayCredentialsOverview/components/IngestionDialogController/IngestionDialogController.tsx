import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { IngestionDialog } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/components/IngestionDialogController/components/IngestionDialog";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

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
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <IngestionDialog
          organizationId={organizationId}
          config={config}
          projects={projects}
          onSaved={closeDialog}
        />
      )}
    >
      {children}
    </DialogController>
  );
}
