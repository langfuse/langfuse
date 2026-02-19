import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { Pencil } from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import type { FinalPreviewStepProps, DialogStep } from "./types";
import { applyFullMapping } from "@langfuse/shared";

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
          />

          {/* Expected Output Preview */}
          <PreviewCard
            label="Expected Output"
            data={previewResult?.expectedOutput}
            onEdit={() => onEditStep("output-mapping" as DialogStep)}
          />

          {/* Metadata Preview */}
          <PreviewCard
            label="Metadata"
            data={previewResult?.metadata}
            onEdit={() => onEditStep("metadata-mapping" as DialogStep)}
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
};

function PreviewCard({ label, data, onEdit }: PreviewCardProps) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <span className="text-sm font-medium">{label}</span>
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
    </div>
  );
}
