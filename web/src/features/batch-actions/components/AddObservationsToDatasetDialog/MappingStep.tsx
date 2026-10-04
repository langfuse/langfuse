import { CustomMappingEditor } from "./components/CustomMappingEditor";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { DatasetSchemaHoverCard } from "@/src/features/datasets";
import type {
  FieldMappingConfig,
  MappingMode,
  ObservationPreviewData,
  PreparedMappingField,
} from "./types";

export function MappingStep({
  field,
  config,
  onConfigChange,
  observationData,
}: {
  field: PreparedMappingField;
  config: FieldMappingConfig;
  onConfigChange: (config: FieldMappingConfig) => void;
  observationData: ObservationPreviewData | null;
}) {
  function changeMode(mode: MappingMode) {
    onConfigChange({
      mode,
      custom: config.custom ?? {
        type: "root",
        rootConfig: { sourceField: field.sourceField, jsonPath: "$" },
      },
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{field.label}</h3>
        {field.schema != null && field.key !== "metadata" && (
          <DatasetSchemaHoverCard
            schemaType={field.key}
            schema={field.schema}
            showLabel
          />
        )}
      </div>
      <SelectInput
        aria-label={`${field.label} mapping`}
        value={config.mode}
        onValueChange={changeMode}
        placeholder="Choose source"
        options={[
          { value: "full", label: `Use observation ${field.sourceField}` },
          { value: "custom", label: "Custom mapping" },
          ...(field.key === "input"
            ? []
            : [{ value: "none" as const, label: "Leave empty" }]),
        ]}
        error={field.errors.length > 0}
      />
      {config.mode === "custom" && config.custom && (
        <CustomMappingEditor
          config={config.custom}
          onChange={(custom) => onConfigChange({ ...config, custom })}
          defaultSourceField={field.sourceField}
          observationData={observationData}
        />
      )}
    </section>
  );
}
