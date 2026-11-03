import { useWatch } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  BlobStorageExportMode,
  BlobStorageIntegrationFileType,
} from "@langfuse/shared";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";

// Frequency, file type, and export mode (with the custom start date when the
// mode requires one).
export const ExportScheduleFields = ({
  control,
}: {
  control: BlobStorageFormControl;
}) => {
  const watchedExportMode = useWatch({ control, name: "exportMode" });

  return (
    <>
      <FormField
        control={control}
        name="exportFrequency"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Export Frequency</FormLabel>
            <FormControl>
              <SelectInput
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select frequency"
                options={[
                  { value: "every_20_minutes", label: "Every 20 Minutes" },
                  { value: "hourly", label: "Hourly" },
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ]}
              />
            </FormControl>
            <FormDescription>
              How often the data should be exported. Changes are taken into
              consideration from the next run onwards.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="fileType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>File Type</FormLabel>
            <FormControl>
              <SelectInput
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select file type"
                options={[
                  {
                    value: BlobStorageIntegrationFileType.PARQUET,
                    label: "Parquet",
                  },
                  {
                    value: BlobStorageIntegrationFileType.JSONL,
                    label: "JSONL",
                  },
                  {
                    value: BlobStorageIntegrationFileType.CSV,
                    label: "CSV",
                  },
                  {
                    value: BlobStorageIntegrationFileType.JSON,
                    label: "JSON",
                  },
                ]}
              />
            </FormControl>
            <FormDescription>
              {field.value === BlobStorageIntegrationFileType.PARQUET
                ? "Apache Parquet — a columnar binary format encoded and compressed by ClickHouse. Gzip compression does not apply."
                : "The file format for exported data."}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="exportMode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Export Mode</FormLabel>
            <FormControl>
              <SelectInput
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select export mode"
                options={[
                  {
                    value: BlobStorageExportMode.FULL_HISTORY,
                    label: "Full history",
                  },
                  {
                    value: BlobStorageExportMode.FROM_TODAY,
                    label: "Today",
                  },
                  {
                    value: BlobStorageExportMode.FROM_CUSTOM_DATE,
                    label: "Custom date",
                  },
                ]}
              />
            </FormControl>
            <FormDescription>
              Choose when to start exporting data. &quot;Today&quot; and
              &quot;Custom date&quot; modes will not include historical data
              before the specified date.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {watchedExportMode === BlobStorageExportMode.FROM_CUSTOM_DATE && (
        <FormField
          control={control}
          name="exportStartDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Export Start Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  max={(() => {
                    const t = new Date();
                    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
                  })()}
                  value={
                    field.value instanceof Date
                      ? field.value.toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) => {
                    const date = e.target.value
                      ? new Date(e.target.value)
                      : null;
                    field.onChange(date);
                  }}
                  placeholder="Select start date"
                />
              </FormControl>
              <FormDescription>
                Data before this date will not be included in exports
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
};
