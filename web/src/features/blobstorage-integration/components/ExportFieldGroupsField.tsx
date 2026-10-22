/* eslint-disable no-nested-ternary */
import { useFormState, useWatch } from "react-hook-form";
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  AnalyticsIntegrationExportSource,
  BlobStorageIntegrationFileType,
  EXPORT_FIELD_GROUP_OPTIONS,
  SCORE_EXPORT_CORE_FIELD_GROUP_OPTION,
  SCORE_EXPORT_FIELD_GROUP_OPTIONS,
} from "@langfuse/shared";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";
import { FieldGroupCheckbox } from "@/src/features/blobstorage-integration/components/FieldGroupCheckbox";

// Field-group checkboxes; descriptions and available groups depend on the
// selected export source and file type.
export const ExportFieldGroupsField = ({
  control,
}: {
  control: BlobStorageFormControl;
}) => {
  const [watchedExportSource, watchedFileType] = useWatch({
    control,
    name: ["exportSource", "fileType"],
  });
  const { errors } = useFormState({ control, name: "exportFieldGroups" });
  const isParquetExport =
    watchedFileType === BlobStorageIntegrationFileType.PARQUET;
  // The legacy observations table contains fewer columns than the enriched
  // observations, so the per-group field lists differ for legacy-only exports.
  const isLegacyOnlyExport =
    watchedExportSource ===
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS;
  // Traces and legacy observations are only exported for the legacy and mixed
  // sources; an EVENTS-only export produces scores and enriched observations.
  const includesLegacyExport =
    watchedExportSource ===
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS ||
    watchedExportSource ===
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS;

  const describeObservationGroup = (
    option: (typeof EXPORT_FIELD_GROUP_OPTIONS)[number],
  ) => {
    if (isParquetExport) {
      return isLegacyOnlyExport
        ? option.legacyParquetDescription
        : option.parquetDescription;
    }
    return isLegacyOnlyExport ? option.legacyDescription : option.description;
  };

  return (
    <FormField
      control={control}
      name="exportFieldGroups"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Export Field Groups</FormLabel>
          <FormDescription>
            Choose which field groups to include in the observation and score
            exports. Deselect large groups (e.g. Input / Output) to reduce
            export size, or privacy-sensitive groups (e.g. Metadata) to avoid
            storing user data.
            {includesLegacyExport
              ? isLegacyOnlyExport
                ? " Traces are always exported in full. Field groups that only exist on the enriched observations (e.g. Trace Context) are not available for this export source."
                : " Traces are always exported in full. Fields that only exist on the enriched observations (e.g. Trace Context) are omitted from the legacy observations export."
              : ""}
          </FormDescription>
          <div className="text-sm font-bold">Observations</div>
          <div className="mt-2 space-y-2">
            {EXPORT_FIELD_GROUP_OPTIONS.filter(
              // Hide no-op groups (no legacy columns) for legacy-only
              // exports; a saved selection is kept and applies again if
              // the source is migrated to enriched observations.
              (option) => !isLegacyOnlyExport || option.includedInLegacyExport,
            ).map((option) =>
              option.value === "core" ? (
                <FieldGroupCheckbox
                  key={option.value}
                  id="field-group-core"
                  required
                  label={option.label}
                  description={describeObservationGroup(option)}
                />
              ) : (
                <FieldGroupCheckbox
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  description={describeObservationGroup(option)}
                  selected={field.value ?? []}
                  onChange={field.onChange}
                />
              ),
            )}
          </div>
          <div className="text-sm font-bold">Scores</div>
          <div className="mt-2 space-y-2">
            <FieldGroupCheckbox
              id="field-group-score-core"
              required
              label={SCORE_EXPORT_CORE_FIELD_GROUP_OPTION.label}
              description={SCORE_EXPORT_CORE_FIELD_GROUP_OPTION.description}
            />
            {SCORE_EXPORT_FIELD_GROUP_OPTIONS.map((option) => (
              <FieldGroupCheckbox
                key={option.value}
                value={option.value}
                label={option.label}
                description={option.description}
                selected={field.value ?? []}
                onChange={field.onChange}
              />
            ))}
          </div>
          <FormMessage>{errors.exportFieldGroups?.message}</FormMessage>
        </FormItem>
      )}
    />
  );
};
