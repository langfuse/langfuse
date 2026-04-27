import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { Pencil } from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import type { FinalPreviewStepProps, DialogStep } from "./types";
import { applyFullMapping } from "@langfuse/shared";
import type { MappingError } from "@langfuse/shared";
import {
  IssueBanner,
  issueCardVariants,
  issueChromeVariants,
  issueIcons,
  issueTextVariants,
  type IssueVariant,
} from "@/src/features/batch-actions/components/AddObservationsToDatasetDialog/components/IssueBanner";

const STEP_FOR_FIELD: Record<string, DialogStep> = {
  input: "input-mapping",
  expectedOutput: "output-mapping",
  metadata: "metadata-mapping",
};

const fieldLabel = (field: string) =>
  field === "expectedOutput" ? "expected output" : field;

export function FinalPreviewStep({
  dataset,
  mapping,
  observationData,
  totalCount,
  onEditStep,
}: FinalPreviewStepProps) {
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

  const { errorsByField, missesByField, errorFields, missFields } =
    useMemo(() => {
      const errorsByField: Record<string, MappingError[]> = {};
      const missesByField: Record<string, MappingError[]> = {};
      for (const err of previewResult?.errors ?? []) {
        const bucket =
          err.type === "json_path_error" ? errorsByField : missesByField;
        (bucket[err.targetField] ??= []).push(err);
      }
      return {
        errorsByField,
        missesByField,
        errorFields: Object.keys(errorsByField),
        missFields: Object.keys(missesByField),
      };
    }, [previewResult?.errors]);

  return (
    <div className="h-[62vh] space-y-6 p-6">
      <div>
        <h3 className="text-lg font-semibold">Review Configuration</h3>
        <p className="text-muted-foreground text-sm">
          Adding {totalCount} observation{totalCount !== 1 ? "s" : ""} to
          dataset &quot;
          {dataset.name}&quot;
        </p>
      </div>

      {errorFields.length > 0 && (
        <IssueBanner
          variant="error"
          title="Some JSONPaths are invalid"
          description="Items using these mappings will be skipped during processing."
        >
          <EditMappingActions
            variant="error"
            fields={errorFields}
            onEditStep={onEditStep}
          />
        </IssueBanner>
      )}

      {missFields.length > 0 && (
        <IssueBanner
          variant="warning"
          title="Some JSONPaths did not match the preview observation"
          description="Observations with failed mappings will be skipped during processing."
        >
          <EditMappingActions
            variant="warning"
            fields={missFields}
            onEditStep={onEditStep}
          />
        </IssueBanner>
      )}

      <div className="text-muted-foreground text-sm">
        Sample dataset item preview (from first selected observation):
      </div>

      {!observationData ? (
        <div className="bg-muted/30 flex h-64 items-center justify-center rounded-md border p-4">
          <p className="text-muted-foreground text-sm">
            No observation data available for preview
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <PreviewCard
            label="Input"
            data={previewResult?.input}
            onEdit={() => onEditStep("input-mapping")}
            pathErrors={errorsByField["input"]}
            pathMisses={missesByField["input"]}
          />
          <PreviewCard
            label="Expected Output"
            data={previewResult?.expectedOutput}
            onEdit={() => onEditStep("output-mapping")}
            pathErrors={errorsByField["expectedOutput"]}
            pathMisses={missesByField["expectedOutput"]}
          />
          <PreviewCard
            label="Metadata"
            data={previewResult?.metadata}
            onEdit={() => onEditStep("metadata-mapping")}
            pathErrors={errorsByField["metadata"]}
            pathMisses={missesByField["metadata"]}
          />
        </div>
      )}
    </div>
  );
}

function EditMappingActions({
  variant,
  fields,
  onEditStep,
}: {
  variant: IssueVariant;
  fields: string[];
  onEditStep: (step: DialogStep) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {fields.map((field) => (
        <Button
          key={field}
          variant="link"
          size="sm"
          className={cn(
            "h-auto p-0 text-xs underline",
            issueTextVariants({ variant }),
          )}
          onClick={() => {
            const step = STEP_FOR_FIELD[field];
            if (step) onEditStep(step);
          }}
        >
          Edit {fieldLabel(field)} mapping
        </Button>
      ))}
    </div>
  );
}

type PreviewCardProps = {
  label: string;
  data: unknown;
  onEdit: () => void;
  pathErrors?: MappingError[];
  pathMisses?: MappingError[];
};

function PreviewCard({
  label,
  data,
  onEdit,
  pathErrors = [],
  pathMisses = [],
}: PreviewCardProps) {
  const variant: IssueVariant | null =
    pathErrors.length > 0 ? "error" : pathMisses.length > 0 ? "warning" : null;
  const Icon = variant ? issueIcons[variant] : null;

  return (
    <div className={issueCardVariants({ variant: variant ?? "none" })}>
      <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {Icon && variant && (
            <Icon
              className={cn("h-3.5 w-3.5", issueTextVariants({ variant }))}
            />
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
          <div className="text-muted-foreground p-4 text-sm italic">null</div>
        ) : (
          <JSONView json={data} className="text-xs" />
        )}
      </div>
      {variant && (
        <div
          className={cn("border-t px-4 py-2", issueChromeVariants({ variant }))}
        >
          <p className="text-xs">
            {[
              pathErrors.length > 0 &&
                `${pathErrors.length} path${pathErrors.length !== 1 ? "s have" : " has"} invalid syntax`,
              pathMisses.length > 0 &&
                `${pathMisses.length} path${pathMisses.length !== 1 ? "s" : ""} did not match in preview observation`,
            ]
              .filter(Boolean)
              .join("; ")}
            . These items will be skipped during processing.
          </p>
        </div>
      )}
    </div>
  );
}
