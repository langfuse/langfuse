import { useState } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IngestionSettingsFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/IngestionSettingsFields";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetupDocsUrl";
import { getInitialIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/getInitialIngestionSettings";
import { isIngestionSettingsValid } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/isIngestionSettingsValid";
import { useSaveGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useSaveGatewayIngestion";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { showSuccessToast } from "@/src/features/notifications";

export type IngestionDialogProps = {
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  onSaved: () => void;
};

export function IngestionDialog({
  organizationId,
  config,
  projects,
  onSaved,
}: IngestionDialogProps) {
  const [settings, setSettings] = useState(() =>
    getInitialIngestionSettings({ config, projects }),
  );
  const { saveIngestion, isSaving } = useSaveGatewayIngestion(organizationId);

  async function handleSave() {
    if (!(await saveIngestion(settings))) return;
    showSuccessToast({
      operation: "aiGateway.updateConfig",
      title: "Ingestion settings saved",
      description: "New gateway requests use these settings.",
    });
    onSaved();
  }

  return (
    <Dialog
      title="Gateway ingestion"
      size="md"
      docsHref={GATEWAY_SETUP_DOCS_URL}
      actions={[
        {
          label: "Save",
          onClick: handleSave,
          loading: isSaving,
          disabled: !isIngestionSettingsValid(settings),
        },
      ]}
    >
      <Dialog.Body>
        <IngestionSettingsFields
          settings={settings}
          projects={projects}
          onChange={setSettings}
        />
      </Dialog.Body>
    </Dialog>
  );
}
