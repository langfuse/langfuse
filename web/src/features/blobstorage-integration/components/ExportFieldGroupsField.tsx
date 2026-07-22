import { useFormState, useWatch } from "react-hook-form";
import { Checkbox } from "@/src/components/ui/checkbox";
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
  type ObservationFieldGroupFull,
} from "@langfuse/shared";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";

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

  return (
    <FormField
      control={control}
      name="exportFieldGroups"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Export Field Groups</FormLabel>
          <FormDescription>
            Choose which field groups to include in the observation exports.
            Deselect large groups (e.g. Input / Output) to reduce export size,
            or privacy-sensitive groups (e.g. Metadata) to avoid storing user
            data.
            {includesLegacyExport
              ? isLegacyOnlyExport
                ? " Traces and scores are always exported in full. Field groups that only exist on the enriched observations (e.g. Trace Context) are not available for this export source."
                : " Traces and scores are always exported in full. Fields that only exist on the enriched observations (e.g. Trace Context) are omitted from the legacy observations export."
              : " Scores are always exported in full."}
          </FormDescription>
          <div className="mt-2 space-y-2">
            {EXPORT_FIELD_GROUP_OPTIONS.filter(
              // Hide no-op groups (no legacy columns) for legacy-only
              // exports; a saved selection is kept and applies again if
              // the source is migrated to enriched observations.
              (option) => !isLegacyOnlyExport || option.includedInLegacyExport,
            ).map((option) => {
              const isCore = option.value === "core";
              return (
                <div key={option.value} className="flex items-start gap-2">
                  <Checkbox
                    id={`field-group-${option.value}`}
                    checked={
                      isCore ? true : (field.value ?? []).includes(option.value)
                    }
                    disabled={isCore}
                    onCheckedChange={
                      isCore
                        ? undefined
                        : (checked) => {
                            const current = field.value ?? [];
                            const next =
                              checked === true
                                ? current.includes(option.value)
                                  ? current
                                  : [...current, option.value]
                                : current.filter(
                                    (v: ObservationFieldGroupFull) =>
                                      v !== option.value,
                                  );
                            field.onChange(next);
                          }
                    }
                  />
                  <label
                    htmlFor={`field-group-${option.value}`}
                    className={
                      isCore ? "space-y-0.5" : "cursor-pointer space-y-0.5"
                    }
                  >
                    <div className="text-sm leading-none font-bold">
                      {option.label}
                      {isCore && (
                        <span className="text-muted-foreground ml-1 font-normal">
                          (required)
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {isParquetExport
                        ? isLegacyOnlyExport
                          ? option.legacyParquetDescription
                          : option.parquetDescription
                        : isLegacyOnlyExport
                          ? option.legacyDescription
                          : option.description}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
          <FormMessage>{errors.exportFieldGroups?.message}</FormMessage>
        </FormItem>
      )}
    />
  );
};
