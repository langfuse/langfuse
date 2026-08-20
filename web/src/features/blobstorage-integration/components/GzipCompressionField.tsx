import { useWatch } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { BlobStorageIntegrationFileType } from "@langfuse/shared";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";

export const GzipCompressionField = ({
  control,
}: {
  control: BlobStorageFormControl;
}) => {
  const watchedFileType = useWatch({ control, name: "fileType" });
  // Parquet compresses internally — gzip does not apply.
  if (watchedFileType === BlobStorageIntegrationFileType.PARQUET) return null;

  return (
    <FormField
      control={control}
      name="compressed"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Gzip Compression</FormLabel>
          <FormControl>
            <div className="mt-1 ml-4">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </div>
          </FormControl>
          <FormDescription>
            Compress exported files with gzip (.csv.gz, .json.gz, .jsonl.gz)
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
