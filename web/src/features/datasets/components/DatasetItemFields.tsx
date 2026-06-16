import { useMemo } from "react";
import { DatasetItemField } from "./DatasetItemField";
import {
  DatasetItemFormMediaAttachments,
  DatasetItemSavedMediaAttachments,
} from "./DatasetItemMediaAttachments";
import { type PendingMediaUpload } from "../hooks/useDatasetItemMediaUpload";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import type { DatasetSchema } from "../utils/datasetItemUtils";
import { type Control, type FieldPath, useWatch } from "react-hook-form";
import { FormField } from "@/src/components/ui/form";

export type DatasetItemFormValues = {
  input: string;
  expectedOutput: string;
  metadata: string;
};

type DatasetItemFieldsProps = {
  // View-mode values for read-only display and validation. They always come
  // from a single item, so they're one object rather than three independent
  // props. Omitted in form mode, where the editors read from `control` instead
  // — keeping them out of the props tree avoids re-rendering every editor on
  // each keystroke (which would defeat the per-field `Controller` isolation).
  values?: DatasetItemFormValues;
  dataset: DatasetSchema | null;
  editable: boolean;
  projectId: string;
  // Present in view mode; selects the saved (table-backed) attachment section.
  datasetItemId?: string;
  // The viewed version (view mode). Passed for a historical version so its
  // attachments resolve to that version; omitted for the latest item.
  datasetItemValidFrom?: Date;
  // For form integration (edit mode)
  control?: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
  onInputChange?: (value: string) => void;
  onExpectedOutputChange?: (value: string) => void;
  onMetadataChange?: (value: string) => void;
  // Enables the per-field media attach button (edit mode); uploads the file and
  // returns the reference string to insert at the field's cursor.
  onUploadMedia?: (file: File) => Promise<string | null>;
  // In-flight uploads (edit mode), shown as placeholders in the attachments.
  pendingUploads?: PendingMediaUpload[];
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
  values,
  dataset,
  editable,
  projectId,
  datasetItemId,
  datasetItemValidFrom,
  control,
  onInputChange,
  onExpectedOutputChange,
  onMetadataChange,
  onUploadMedia,
  pendingUploads,
}: DatasetItemFieldsProps) => {
  const inputValue = values?.input ?? "";
  const expectedOutputValue = values?.expectedOutput ?? "";
  const metadataValue = values?.metadata ?? "";

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
            name={"input" as FieldPath<DatasetItemFormValues>}
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
                onUploadMedia={onUploadMedia}
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
            name={"expectedOutput" as FieldPath<DatasetItemFormValues>}
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
                onUploadMedia={onUploadMedia}
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
          name={"metadata" as FieldPath<DatasetItemFormValues>}
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
              onUploadMedia={onUploadMedia}
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

      {isFormMode && control ? (
        <FormModeMediaAttachments
          control={control}
          pendingUploads={pendingUploads}
        />
      ) : datasetItemId ? (
        <DatasetItemSavedMediaAttachments
          projectId={projectId}
          datasetItemId={datasetItemId}
          datasetItemValidFrom={datasetItemValidFrom}
        />
      ) : null}
    </div>
  );
};

/**
 * Subscribes to the live field values via `useWatch` so only this attachment
 * section re-renders as the user types — not the editors above it. Keeping the
 * subscription here (rather than in the form parent) is what lets the parent
 * avoid threading watched values through the whole field tree.
 */
const FormModeMediaAttachments = ({
  control,
  pendingUploads,
}: {
  control: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
  pendingUploads?: PendingMediaUpload[];
}) => {
  const [input, expectedOutput, metadata] = useWatch({
    control,
    name: ["input", "expectedOutput", "metadata"],
  });

  return (
    <DatasetItemFormMediaAttachments
      jsonStrings={[input, expectedOutput, metadata]}
      pendingUploads={pendingUploads}
    />
  );
};
