import { useMemo, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  type AnalyticsIntegrationExportSource,
  type ExportSourceContext,
} from "@langfuse/shared";
import {
  blobStorageIntegrationFormSchema,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { isExportSourceSelectable } from "@/src/features/analytics-integrations/exportSource";
import { type BlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { StorageProviderFields } from "@/src/features/blobstorage-integration/components/StorageProviderFields";
import { ExportScheduleFields } from "@/src/features/blobstorage-integration/components/ExportScheduleFields";
import { ExportSourceField } from "@/src/features/blobstorage-integration/components/ExportSourceField";
import { ExportFieldGroupsField } from "@/src/features/blobstorage-integration/components/ExportFieldGroupsField";
import { GzipCompressionField } from "@/src/features/blobstorage-integration/components/GzipCompressionField";

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
  onSubmit,
  children,
}: {
  initialValues: BlobStorageFormValues;
  exportSourceCtx: ExportSourceContext;
  persistedExportSource: AnalyticsIntegrationExportSource | null | undefined;
  isSaving: boolean;
  onSubmit: (values: BlobStorageIntegrationFormSchema) => void;
  // Entity-scoped action buttons (Validate / Run Now / Reset) rendered by
  // the container next to Save — they act on the persisted entity, not on
  // this draft.
  children?: ReactNode;
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

  return (
    <Form {...blobStorageForm}>
      <form
        className="space-y-3"
        onSubmit={blobStorageForm.handleSubmit(onSubmit)}
      >
        <StorageProviderFields control={control} />
        <ExportScheduleFields control={control} />
        <ExportSourceField
          control={control}
          persistedExportSource={persistedExportSource}
          exportSourceCtx={exportSourceCtx}
        />
        <ExportFieldGroupsField control={control} />
        <GzipCompressionField control={control} />
        <FormField
          control={control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enabled</FormLabel>
              <FormControl>
                <div className="mt-1 ml-4">
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
      <div className="mt-8 flex gap-2">
        <Button
          loading={isSaving}
          onClick={blobStorageForm.handleSubmit(onSubmit)}
        >
          Save
        </Button>
        {children}
      </div>
    </Form>
  );
};
