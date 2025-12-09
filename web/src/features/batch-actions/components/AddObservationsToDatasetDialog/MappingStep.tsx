import { MappingModeSelector } from "./components/MappingModeSelector";
import { CustomMappingEditor } from "./components/CustomMappingEditor";
import { MappingPreviewPanel } from "./components/MappingPreviewPanel";
import type {
  MappingStepProps,
  MappingMode,
  CustomMappingConfig,
} from "./types";

export function MappingStep({
  field,
  fieldLabel,
  defaultSourceField,
  config,
  onConfigChange,
  observationData,
  isLoading,
}: MappingStepProps) {
  // Get the full label for the "Full" option
  const getFullLabel = () => {
    switch (field) {
      case "input":
        return "Full observation input";
      case "expectedOutput":
        return "Full observation output";
      case "metadata":
        return "Full observation metadata";
      default:
        return `Full observation ${field}`;
    }
  };

  const handleModeChange = (mode: MappingMode) => {
    if (mode === "custom") {
      // Initialize custom config if switching to custom
      onConfigChange({
        mode: "custom",
        custom: config.custom ?? {
          type: "root",
          rootConfig: {
            sourceField: defaultSourceField,
            jsonPath: "$",
          },
        },
      });
    } else {
      onConfigChange({
        mode,
        custom: config.custom, // Preserve custom config in case they switch back
      });
    }
  };

  const handleCustomConfigChange = (customConfig: CustomMappingConfig) => {
    onConfigChange({
      ...config,
      custom: customConfig,
    });
  };

  return (
    <div className="grid h-[62vh] grid-cols-[1fr,1fr] gap-6 overflow-hidden p-6">
      {/* Left: Configuration */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Dataset Item {fieldLabel}</h3>
          <p className="text-sm text-muted-foreground">
            Configure how observation data maps to the Dataset Item {fieldLabel}
            .
          </p>
        </div>

        <MappingModeSelector
          value={config.mode}
          onChange={handleModeChange}
          fullLabel={getFullLabel()}
          fieldName={field}
        />

        {config.mode === "custom" && config.custom && (
          <CustomMappingEditor
            config={config.custom}
            onChange={handleCustomConfigChange}
            defaultSourceField={defaultSourceField}
            observationData={observationData}
          />
        )}
      </div>

      {/* Right: Preview */}
      <div className="h-full border-l pl-6">
        <MappingPreviewPanel
          fieldLabel={fieldLabel}
          defaultSourceField={defaultSourceField}
          config={config}
          observationData={observationData}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
