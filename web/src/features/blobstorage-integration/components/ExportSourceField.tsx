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
import { type AnalyticsIntegrationExportSource } from "@langfuse/shared";
import {
  getExportSourceOptions,
  isExportSourceSelectable,
  shouldHideExportSourceSelector,
  type ExportSourceAvailability,
} from "@/src/features/blobstorage-integration/exportSource";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";

// Export source selector plus the blocked-save alert for a persisted source
// that is no longer selectable on this deployment.
export const ExportSourceField = ({
  control,
  persistedExportSource,
  availability,
}: {
  control: BlobStorageFormControl;
  persistedExportSource: AnalyticsIntegrationExportSource | null | undefined;
  availability: ExportSourceAvailability;
}) => {
  const watchedExportSource = useWatch({ control, name: "exportSource" });
  const exportSourceOptions = getExportSourceOptions(
    persistedExportSource,
    availability,
  );
  // No decision to make → no selector. Only the degenerate single-option
  // state (stale persisted source) stays visible, locked, so the
  // unavailable-source alert below has something to refer to.
  const hideExportSource = shouldHideExportSourceSelector(exportSourceOptions);
  const exportSourceLocked = exportSourceOptions.length === 1;
  const exportSourceUnavailable =
    watchedExportSource != null &&
    !isExportSourceSelectable(watchedExportSource, availability);

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
                        <div className="font-medium">{option.label}</div>
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

      {exportSourceUnavailable && (
        <Alert variant="destructive">
          <AlertTitle>Saved export source is no longer available</AlertTitle>
          <AlertDescription>
            {/* Two distinct rejection reasons; key on the deployment, not the
                source, since TRACES_OBSERVATIONS_EVENTS is both enriched and
                legacy. !eventsExportAvailable means enriched is genuinely
                unavailable; otherwise the block is the Cloud legacy cutoff. */}
            {!availability.eventsExportAvailable
              ? "This integration is configured to export enriched observations, but enriched export is not available on this deployment. Saving is blocked until you select an available export source above. To keep the current configuration instead, re-enable enriched export (V4 preview opt-in) on your deployment."
              : "This integration is configured to export legacy traces and observations, which is no longer available for this project. Saving is blocked until you select an available export source above."}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
