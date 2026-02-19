import { useMemo } from "react";
import { DatasetItemField } from "./DatasetItemField";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import type { DatasetSchema } from "../utils/datasetItemUtils";
import type { Control, FieldPath } from "react-hook-form";
import { FormField } from "@/src/components/ui/form";

type DatasetItemFieldsProps = {
  inputValue: string;
  expectedOutputValue: string;
  metadataValue: string;
  dataset: DatasetSchema | null;
  editable: boolean;
  // For form integration (edit mode)
  control?: Control<any>;
  onInputChange?: (value: string) => void;
  onExpectedOutputChange?: (value: string) => void;
  onMetadataChange?: (value: string) => void;
};

/**
 * Container component for dataset item fields (Input, Expected Output, Metadata).
 * Handles validation and error display for all fields.
 *
 * Can be used in two modes:
 * - View mode: read-only display with validation errors shown
 * - Edit mode: editable fields within a form (validation errors hidden during editing)
 */
export const DatasetItemFields = ({
  inputValue,
  expectedOutputValue,
  metadataValue,
  dataset,
  editable,
  control,
  onInputChange,
  onExpectedOutputChange,
  onMetadataChange,
}: DatasetItemFieldsProps) => {
  // Create dataset array for validation hook
  const datasets = useMemo(() => {
    if (!dataset) return [];
    return [dataset];
  }, [dataset]);

  // Validate against dataset schemas
  const validation = useDatasetItemValidation(
    inputValue,
    expectedOutputValue,
    datasets,
  );

  // Filter validation errors by field
  const inputErrors = validation.errors.filter((e) => e.field === "input");
  const expectedOutputErrors = validation.errors.filter(
    (e) => e.field === "expectedOutput",
  );

  const isFormMode = !!control;
  // In form mode, don't show validation errors (only used for submit button state)
  const showErrors = !isFormMode;

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Input Field */}
        {isFormMode && control ? (
          <FormField
            control={control}
            name={"input" as FieldPath<any>}
            render={({ field }) => (
              <DatasetItemField
                label="Input"
                value={field.value}
                schema={dataset?.inputSchema}
                schemaType="input"
                editable={editable}
                onChange={(v) => {
                  onInputChange?.(v);
                  field.onChange(v);
                }}
                errors={inputErrors}
                showErrors={showErrors}
                hasSchemas={validation.hasSchemas}
                isFormField
              />
            )}
          />
        ) : (
          <DatasetItemField
            label="Input"
            value={inputValue}
            schema={dataset?.inputSchema}
            schemaType="input"
            editable={false}
            errors={inputErrors}
            hasSchemas={validation.hasSchemas}
          />
        )}

        {/* Expected Output Field */}
        {isFormMode && control ? (
          <FormField
            control={control}
            name={"expectedOutput" as FieldPath<any>}
            render={({ field }) => (
              <DatasetItemField
                label="Expected output"
                value={field.value}
                schema={dataset?.expectedOutputSchema}
                schemaType="expectedOutput"
                editable={editable}
                onChange={(v) => {
                  onExpectedOutputChange?.(v);
                  field.onChange(v);
                }}
                errors={expectedOutputErrors}
                showErrors={showErrors}
                hasSchemas={validation.hasSchemas}
                isFormField
              />
            )}
          />
        ) : (
          <DatasetItemField
            label="Expected output"
            value={expectedOutputValue}
            schema={dataset?.expectedOutputSchema}
            schemaType="expectedOutput"
            editable={false}
            errors={expectedOutputErrors}
            hasSchemas={validation.hasSchemas}
          />
        )}
      </div>

      {/* Metadata Field */}
      {isFormMode && control ? (
        <FormField
          control={control}
          name={"metadata" as FieldPath<any>}
          render={({ field }) => (
            <DatasetItemField
              label="Metadata"
              value={field.value}
              editable={editable}
              onChange={(v) => {
                onMetadataChange?.(v);
                field.onChange(v);
              }}
              isFormField
            />
          )}
        />
      ) : (
        <DatasetItemField
          label="Metadata"
          value={metadataValue}
          editable={false}
        />
      )}
    </div>
  );
};
