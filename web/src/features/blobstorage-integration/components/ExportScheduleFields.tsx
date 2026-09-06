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
import { useTranslations } from "next-intl";

// Frequency, file type, and export mode (with the custom start date when the
// mode requires one).
export const ExportScheduleFields = ({
  control,
}: {
  control: BlobStorageFormControl;
}) => {
  const t = useTranslations("integrationsSettings.blobStorage.schedule");
  const watchedExportMode = useWatch({ control, name: "exportMode" });

  return (
    <>
      <FormField
        control={control}
        name="exportFrequency"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("frequency")}</FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectFrequency")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="every_20_minutes">
                    {t("every20Minutes")}
                  </SelectItem>
                  <SelectItem value="hourly">{t("hourly")}</SelectItem>
                  <SelectItem value="daily">{t("daily")}</SelectItem>
                  <SelectItem value="weekly">{t("weekly")}</SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            <FormDescription>{t("frequencyDescription")}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="fileType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("fileType")}</FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectFileType")} />
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
                ? t("parquetDescription")
                : t("fileTypeDescription")}
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
            <FormLabel>{t("mode")}</FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectMode")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BlobStorageExportMode.FULL_HISTORY}>
                    {t("fullHistory")}
                  </SelectItem>
                  <SelectItem value={BlobStorageExportMode.FROM_TODAY}>
                    {t("today")}
                  </SelectItem>
                  <SelectItem value={BlobStorageExportMode.FROM_CUSTOM_DATE}>
                    {t("customDate")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            <FormDescription>{t("modeDescription")}</FormDescription>
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
              <FormLabel>{t("startDate")}</FormLabel>
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
                  placeholder={t("selectStartDate")}
                />
              </FormControl>
              <FormDescription>{t("startDateDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
};
