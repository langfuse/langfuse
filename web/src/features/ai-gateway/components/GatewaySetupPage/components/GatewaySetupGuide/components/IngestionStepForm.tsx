import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { IngestionSettingsFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/IngestionSettingsFields";
import { getInitialIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/getInitialIngestionSettings";
import { isIngestionSettingsValid } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/isIngestionSettingsValid";
import { useSaveGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useSaveGatewayIngestion";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type IngestionStepFormProps = {
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
};

export function IngestionStepForm({
  organizationId,
  config,
  projects,
}: IngestionStepFormProps) {
  const [settings, setSettings] = useState(() =>
    getInitialIngestionSettings({ config, projects }),
  );
  const { saveIngestion, isSaving } = useSaveGatewayIngestion(organizationId);

  async function handleContinue() {
    await saveIngestion(settings);
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
