import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { IngestionSettingsFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/IngestionSettingsFields";
import { getInitialIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/getInitialIngestionSettings";
import { isIngestionSettingsValid } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/isIngestionSettingsValid";
import type {
  GatewayConfig,
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type IngestionStepFormProps = {
  config: GatewayConfig | null;
  projects: GatewayProject[];
  isSaving: boolean;
  onContinue: (settings: GatewayIngestionSettings) => Promise<unknown>;
};

export function IngestionStepForm({
  config,
  projects,
  isSaving,
  onContinue,
}: IngestionStepFormProps) {
  const [settings, setSettings] = useState(() =>
    getInitialIngestionSettings({ config, projects }),
  );
  async function handleContinue() {
    await onContinue(settings);
  }

  return (
    <div className="flex flex-col items-start gap-4 pt-2">
      <IngestionSettingsFields
        settings={settings}
        projects={projects}
        onChange={setSettings}
      />
      <Button
        text="Continue"
        loading={isSaving}
        disabled={!isIngestionSettingsValid(settings)}
        onClick={handleContinue}
      />
    </div>
  );
}
