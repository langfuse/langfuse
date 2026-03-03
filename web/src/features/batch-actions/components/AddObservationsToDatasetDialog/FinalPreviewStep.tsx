import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { AlertTriangle, Pencil } from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import type { FinalPreviewStepProps, DialogStep } from "./types";
import { applyFullMapping } from "@langfuse/shared";
import type { MappingError } from "@langfuse/shared";

export function FinalPreviewStep({
  dataset,
  mapping,
  observationData,
  totalCount,
  onEditStep,
}: FinalPreviewStepProps) {
  // Compute the full preview
  const previewResult = useMemo(() => {
    if (!observationData) return null;

    return applyFullMapping({
      observation: {
        input: observationData.input,
        output: observationData.output,
        metadata: observationData.metadata,
      },
      mapping,
    });
  }, [observationData, mapping]);

  // Group errors by target field
  const errorsByField = useMemo(() => {
    const errors = previewResult?.errors ?? [];
    const grouped: Record<string, MappingError[]> = {};
    for (const err of errors) {
      if (!grouped[err.targetField]) {
        grouped[err.targetField] = [];
      }
      grouped[err.targetField].push(err);
    }
    return grouped;
  }, [previewResult?.errors]);

  const hasWarnings = (previewResult?.errors?.length ?? 0) > 0;

  const stepForField: Record<string, DialogStep> = {
    input: "input-mapping" as DialogStep,
    expectedOutput: "output-mapping" as DialogStep,
    metadata: "metadata-mapping" as DialogStep,
  };

  return (
    <div className="h-[62vh] space-y-6 p-6">
      <div>
        <h3 className="text-lg font-semibold">Review Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Adding {totalCount} observation{totalCount !== 1 ? "s" : ""} to
          dataset &quot;
          {dataset.name}&quot;
        </p>
      </div>

      {/* Overall warning banner */}
      {hasWarnings && (
        <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                Some JSON paths did not match the preview observation
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-500/80">
                Observations with failed mappings will be skipped during
                processing.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(errorsByField).map(([field]) => (
                  <Button
                    key={field}
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-amber-600 underline dark:text-amber-500"
                    onClick={() => {
                      const step = stepForField[field];
                      if (step) onEditStep(step);
                    }}
                  >
                    Edit{" "}
                    {field === "expectedOutput" ? "expected output" : field}{" "}
                    mapping
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Sample dataset item preview (from first selected observation):
      </div>

      {!observationData ? (
        <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            No observation data available for preview
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Input Preview */}
          <PreviewCard
            label="Input"
            data={previewResult?.input}
            onEdit={() => onEditStep("input-mapping" as DialogStep)}
            errors={errorsByField["input"]}
          />

          {/* Expected Output Preview */}
          <PreviewCard
            label="Expected Output"
            data={previewResult?.expectedOutput}
            onEdit={() => onEditStep("output-mapping" as DialogStep)}
            errors={errorsByField["expectedOutput"]}
          />

          {/* Metadata Preview */}
          <PreviewCard
            label="Metadata"
            data={previewResult?.metadata}
            onEdit={() => onEditStep("metadata-mapping" as DialogStep)}
            errors={errorsByField["metadata"]}
          />
        </div>
      )}
    </div>
  );
}

type PreviewCardProps = {
  label: string;
  data: unknown;
  onEdit: () => void;
  errors?: MappingError[];
};

function PreviewCard({ label, data, onEdit, errors }: PreviewCardProps) {
  const hasErrors = errors && errors.length > 0;

  return (
    <div
      className={cn("rounded-lg border", hasErrors && "border-amber-500/50")}
    >
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {hasErrors && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
          )}
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 gap-1 text-xs"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </div>
      <div className="max-h-62 overflow-auto">
        {data === null ? (
          <div className="p-4 text-sm italic text-muted-foreground">null</div>
        ) : (
          <JSONView json={data} className="text-xs" />
        )}
      </div>
      {hasErrors && (
        <div className="border-t border-amber-500/50 bg-amber-50 px-4 py-2 dark:bg-amber-950/30">
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {errors.length} path{errors.length !== 1 ? "s" : ""} did not match
            in preview observation. These items will be skipped during
            processing.
          </p>
        </div>
      )}
    </div>
  );
}
