import type { GatewayIngestionMode } from "@langfuse/shared";

import { IngestionModeCard } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/components/IngestionModeCard";
import { IngestionProjectRow } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/components/IngestionProjectRow";
import type {
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GATEWAY_INGESTION_MODES } from "@/src/features/ai-gateway/constants/gatewayIngestionModes";

export type IngestionSettingsFieldsProps = {
  settings: GatewayIngestionSettings;
  projects: GatewayProject[];
  onChange: (settings: GatewayIngestionSettings) => void;
};

export function IngestionSettingsFields({
  settings,
  projects,
  onChange,
}: IngestionSettingsFieldsProps) {
  function handleModeSelect(ingestionMode: GatewayIngestionMode) {
    onChange({ ...settings, ingestionMode });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 md:grid-cols-3">
        {GATEWAY_INGESTION_MODES.map((option) => (
          <IngestionModeCard
            key={option.value}
            option={option}
            selected={settings.ingestionMode === option.value}
            onSelect={handleModeSelect}
          />
        ))}
      </div>
      {settings.ingestionMode === "NONE" ? null : (
        <IngestionProjectRow
          settings={settings}
          projects={projects}
          onChange={onChange}
        />
      )}
    </div>
  );
}
