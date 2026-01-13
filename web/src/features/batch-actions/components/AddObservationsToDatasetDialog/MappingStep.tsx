import { useEffect, useRef } from "react";
import { MappingModeSelector } from "./components/MappingModeSelector";
import { CustomMappingEditor } from "./components/CustomMappingEditor";
import { MappingPreviewPanel } from "./components/MappingPreviewPanel";
import { DatasetSchemaHoverCard } from "@/src/features/datasets/components/DatasetSchemaHoverCard";
import {
  extractSchemaFields,
  isObjectSchema,
  generateEntriesFromSchema,
} from "./utils/extractSchemaFields";
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
  schema,
  onValidationChange,
}: MappingStepProps) {
  const hasSchema = schema !== null && schema !== undefined;
  const isObjectType = hasSchema && isObjectSchema(schema);
  const hasInitializedRef = useRef(false);

  // Auto-initialize to custom key-value mode with schema-derived entries when:
  // 1. Schema exists and is an object type
  // 2. Config hasn't been manually set yet (mode is "full" which is the default)
  // 3. We haven't already initialized
  useEffect(() => {
    if (
      isObjectType &&
      config.mode === "full" &&
      !hasInitializedRef.current &&
      !config.custom?.keyValueMapConfig // Don't override if already has key-value config
    ) {
      hasInitializedRef.current = true;

      const schemaFields = extractSchemaFields(schema);
      if (schemaFields.length > 0) {
        const entries = generateEntriesFromSchema(
          schemaFields,
          defaultSourceField,
        );

        onConfigChange({
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries,
            },
          },
        });
      }
    }
  }, [
    isObjectType,
    schema,
    config.mode,
    config.custom,
    defaultSourceField,
    onConfigChange,
  ]);

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
    <div className="grid h-[62vh] grid-cols-[minmax(0,1fr),minmax(0,1fr)] gap-6 overflow-auto p-6">
      {/* Left: Configuration */}
      <div className="min-w-0 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="flex-grow text-lg font-semibold">
              Dataset Item {fieldLabel}
            </h3>
            {hasSchema && (
              <DatasetSchemaHoverCard
                schemaType={
                  field === "expectedOutput" ? "expectedOutput" : "input"
                }
                schema={schema}
                showLabel
              />
            )}
          </div>
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
      <div className="min-w-0 border-l pl-6">
        <MappingPreviewPanel
          fieldLabel={fieldLabel}
          defaultSourceField={defaultSourceField}
          config={config}
          observationData={observationData}
          isLoading={isLoading}
          schema={schema}
          onValidationChange={onValidationChange}
        />
      </div>
    </div>
  );
}
