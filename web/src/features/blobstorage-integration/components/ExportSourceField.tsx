import { useWatch } from "react-hook-form";
import { Info, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  validateExportSource,
  type AnalyticsIntegrationExportSource,
  type ExportSourceContext,
} from "@langfuse/shared";
import {
  getExportSourceOptions,
  getExportSourceUnavailableMessage,
  shouldHideExportSourceSelector,
} from "@/src/features/analytics-integrations/exportSource";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";

// Export source selector plus the blocked-save alert for a persisted source
// that is no longer selectable on this deployment.
export const ExportSourceField = ({
  control,
  persistedExportSource,
  exportSourceCtx,
}: {
  control: BlobStorageFormControl;
  persistedExportSource: AnalyticsIntegrationExportSource | null | undefined;
  exportSourceCtx: ExportSourceContext;
}) => {
  const watchedExportSource = useWatch({ control, name: "exportSource" });
  const exportSourceOptions = getExportSourceOptions(
    persistedExportSource,
    exportSourceCtx,
  );
  // No decision to make → no selector. Only the degenerate single-option
  // state (stale persisted source) stays visible, locked, so the
  // unavailable-source alert below has something to refer to.
  const hideExportSource = shouldHideExportSourceSelector(exportSourceOptions);
  const exportSourceLocked = exportSourceOptions.length === 1;
  const watchedValidation =
    watchedExportSource != null
      ? validateExportSource(watchedExportSource, exportSourceCtx)
      : ({ ok: true } as const);

  return (
    <>
      {!hideExportSource && (
        <FormField
          control={control}
          name="exportSource"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5 pt-2">
                Export Source
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="text-muted-foreground h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="max-w-[350px] space-y-2 p-3"
                  >
                    {exportSourceOptions.map((option) => (
                      <div key={option.value} className="space-y-0.5">
                        <div className="font-bold">{option.label}</div>
                        <div className="text-muted-foreground text-xs">
                          {option.description}
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-2">
                      <a
                        href="https://langfuse.com/docs/integrations/export-sources"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        For further information see
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={exportSourceLocked}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select data to export" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {exportSourceOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.unavailable}
                    >
                      {option.unavailable
                        ? `${option.label} (not available on this deployment)`
                        : option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Choose which data sources to export to blob storage. Scores are
                always included.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {!watchedValidation.ok && (
        <Alert variant="destructive">
          <AlertTitle>Saved export source is no longer available</AlertTitle>
          <AlertDescription>
            {/* Reason-specific body; texts live in the shared lookup. */}
            {getExportSourceUnavailableMessage(watchedValidation.reason)}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
