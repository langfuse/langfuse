import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IngestionSettingsFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/IngestionSettingsFields";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { getInitialIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/getInitialIngestionSettings";
import { isIngestionSettingsValid } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/isIngestionSettingsValid";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type IngestionDialogProps = {
  config: GatewayConfig | null;
  projects: GatewayProject[];
  isSaving: boolean;
  /** Resolves to whether the settings were saved; the dialog closes only then. */
  onSave: (settings: GatewayIngestionSettings) => Promise<boolean>;
  onSaved: () => void;
};

export function IngestionDialog({
  config,
  projects,
  isSaving,
  onSave,
  onSaved,
}: IngestionDialogProps) {
  const [settings, setSettings] = useState(() =>
    getInitialIngestionSettings({ config, projects }),
  );

  async function handleSave() {
    if (await onSave(settings)) onSaved();
  }

  return (
    <Dialog
      title="Gateway ingestion"
      size="md"
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
        <p className="text-muted-foreground">
          Choose what Langfuse records for requests sent through the gateway.{" "}
          <Button
            variant="text"
            text="How ingestion modes work"
            href={GATEWAY_SETUP.docsUrl}
          />
        </p>
        <IngestionSettingsFields
          settings={settings}
          projects={projects}
          onChange={setSettings}
        />
      </Dialog.Body>
    </Dialog>
  );
}
