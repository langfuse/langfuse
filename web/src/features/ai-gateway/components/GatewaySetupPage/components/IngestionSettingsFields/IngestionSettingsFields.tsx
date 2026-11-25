import type { GatewayIngestionMode } from "@langfuse/shared";

import { IngestionModeCard } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/components/IngestionModeCard";
import { IngestionProjectRow } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/IngestionSettingsFields/components/IngestionProjectRow";
import type {
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GATEWAY_INGESTION_MODES } from "@/src/features/ai-gateway/constants/gatewayIngestionModes";
import { isGatewayIngestionModeAvailable } from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";
import { cn } from "@/src/utils/tailwind";

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
  const modes = GATEWAY_INGESTION_MODES.filter((option) =>
    isGatewayIngestionModeAvailable(option.value),
  );

  function handleModeSelect(ingestionMode: GatewayIngestionMode) {
    onChange({ ...settings, ingestionMode });
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "grid gap-2",
          modes.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2",
        )}
      >
        {modes.map((option) => (
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
