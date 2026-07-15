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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
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
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="every_20_minutes">
                    Every 20 Minutes
                  </SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
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
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select file type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARQUET">Parquet</SelectItem>
                  <SelectItem value="JSONL">JSONL</SelectItem>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="JSON">JSON</SelectItem>
                </SelectContent>
              </Select>
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
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select export mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BlobStorageExportMode.FULL_HISTORY}>
                    Full history
                  </SelectItem>
                  <SelectItem value={BlobStorageExportMode.FROM_TODAY}>
                    Today
                  </SelectItem>
                  <SelectItem value={BlobStorageExportMode.FROM_CUSTOM_DATE}>
                    Custom date
                  </SelectItem>
                </SelectContent>
              </Select>
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
