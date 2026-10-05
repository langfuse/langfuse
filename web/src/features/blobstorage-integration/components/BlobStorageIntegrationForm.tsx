import { useMemo, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  type AnalyticsIntegrationExportSource,
  BlobStorageIntegrationFileType,
  type ExportSourceContext,
} from "@langfuse/shared";
import {
  blobStorageIntegrationFormSchema,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { isExportSourceSelectable } from "@/src/features/analytics-integrations";
import { type BlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { StorageProviderFields } from "@/src/features/blobstorage-integration/components/StorageProviderFields";
import { ExportScheduleFields } from "@/src/features/blobstorage-integration/components/ExportScheduleFields";
import { ExportSourceField } from "@/src/features/blobstorage-integration/components/ExportSourceField";
import { ExportFieldGroupsField } from "@/src/features/blobstorage-integration/components/ExportFieldGroupsField";
import { ToggleableCard } from "@/src/components/design-system/ToggleableCard/ToggleableCard";

// Disposable draft layer. The container mounts one instance per entity
// identity (project + config existence, via React key) after all async
// inputs have resolved. Initial state flows in once through defaultValues;
// edits flow out only through onSubmit. There is deliberately no reset
// logic and no tRPC access here — a stale draft is discarded by remount,
// never patched in place.
export const BlobStorageIntegrationForm = ({
  initialValues,
  exportSourceCtx,
  persistedExportSource,
  isSaving,
  showMediaStorage,
  onSubmit,
  deleteAction,
  mediaStorageActions,
  scheduledExportActions,
}: {
  initialValues: BlobStorageFormValues;
  exportSourceCtx: ExportSourceContext;
  persistedExportSource: AnalyticsIntegrationExportSource | null | undefined;
  isSaving: boolean;
  showMediaStorage: boolean;
  onSubmit: (values: BlobStorageIntegrationFormSchema) => void;
  deleteAction: ReactNode;
  mediaStorageActions: ReactNode;
  scheduledExportActions: ReactNode;
}) => {
  // Block the save when the persisted source is no longer selectable rather
  // than silently rewriting it (LFE-10296). The policy context is fixed for
  // the lifetime of this mount: it derives from the project and config
  // identity, and any identity change remounts the form via the container key.
  const formSchema = useMemo(
    () =>
      blobStorageIntegrationFormSchema.superRefine((data, ctx) => {
        if (!isExportSourceSelectable(data.exportSource, exportSourceCtx)) {
          ctx.addIssue({
            code: "custom",
            path: ["exportSource"],
            message:
              "This export source is not available on this deployment. Select an available export source to save.",
          });
        }
      }),
    [exportSourceCtx],
  );

  const blobStorageForm = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  });

  const control = blobStorageForm.control;
  const fileType = useWatch({ control, name: "fileType" });
  const storageType = useWatch({ control, name: "type" });

  return (
    <Form {...blobStorageForm}>
      <form
        className="space-y-4"
        onSubmit={blobStorageForm.handleSubmit(onSubmit)}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StorageProviderFields control={control} />
          </CardContent>
        </Card>
        <FormField
          control={control}
          name="enabled"
          render={({ field }) => (
            <ToggleableCard
              id="scheduled-exports-enabled"
              title="Scheduled exports"
              checked={field.value ?? false}
              disabled={false}
              onCheckedChange={field.onChange}
              actions={scheduledExportActions}
            >
              <FormField
                control={control}
                name="prefix"
                render={({ field: prefixField }) => (
                  <FormItem>
                    <FormLabel>Export Prefix</FormLabel>
                    <FormControl>
                      <Input {...prefixField} />
                    </FormControl>
                    <FormDescription>
                      Optional path for exported files, for example{" "}
                      <code>langfuse-exports/</code>.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ExportScheduleFields control={control} />
              <ExportSourceField
                control={control}
                persistedExportSource={persistedExportSource}
                exportSourceCtx={exportSourceCtx}
              />
              <ExportFieldGroupsField control={control} />
              {/* Parquet compresses internally — gzip does not apply. */}
              {fileType !== BlobStorageIntegrationFileType.PARQUET && (
                <FormField
                  control={control}
                  name="compressed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gzip Compression</FormLabel>
                      <FormControl>
                        <div className="mt-1 ml-4">
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Compress exported files with gzip (.csv.gz, .json.gz,
                        .jsonl.gz)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </ToggleableCard>
          )}
        />
        {showMediaStorage && (
          <FormField
            control={control}
            name="mediaStorageEnabled"
            render={({ field }) => (
              <ToggleableCard
                id="external-media-storage-enabled"
                title="External media storage"
                checked={field.value ?? false}
                disabled={storageType === "AZURE_BLOB_STORAGE" && !field.value}
                onCheckedChange={field.onChange}
                actions={mediaStorageActions}
              >
                <p className="text-muted-foreground text-sm">
                  Resolve canonical <code>s3://&lt;bucket&gt;/&lt;key&gt;</code>{" "}
                  references under a dedicated media prefix for inline previews.
                  Configure the bucket CORS policy to allow browser reads from
                  your Langfuse origin.
                </p>
                <FormField
                  control={control}
                  name="mediaPrefix"
                  render={({ field: prefixField }) => (
                    <FormItem>
                      <FormLabel>Media Prefix</FormLabel>
                      <FormControl>
                        <Input {...prefixField} placeholder="langfuse-media/" />
                      </FormControl>
                      <FormDescription>
                        Required path containing media objects that Langfuse may
                        sign for inline previews.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ToggleableCard>
            )}
          />
        )}
      </form>
      <div className="mt-8 flex items-center justify-between gap-2">
        <div>{deleteAction}</div>
        <div className="flex justify-end">
          <Button
            loading={isSaving}
            onClick={blobStorageForm.handleSubmit(onSubmit)}
          >
            Save
          </Button>
        </div>
      </div>
    </Form>
  );
};
