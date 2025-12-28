import { Pencil, Trash } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { type ScoreDomain } from "@langfuse/shared";
import { useCorrectionData } from "./hooks/useCorrectionData";
import { useCorrectionMutations } from "./hooks/useCorrectionMutations";
import { useCorrectionEditor } from "./hooks/useCorrectionEditor";

interface CorrectedOutputFieldProps {
  actualOutput?: unknown;
  existingCorrection?: ScoreDomain | null;
  observationId?: string;
}

export function CorrectedOutputField({
  actualOutput,
  existingCorrection,
  observationId,
}: CorrectedOutputFieldProps) {
  const { trace } = useTraceData();

  // Get data from trace context
  const projectId = trace.projectId;
  const traceId = trace.id;
  const environment = trace.environment;

  // Merge cache + server data
  const { effectiveCorrection, correctionValue } = useCorrectionData(
    existingCorrection,
    observationId,
  );

  // Handle mutations with optimistic updates
  const { saveStatus, setSaveStatus, handleSave, handleDelete } =
    useCorrectionMutations({
      projectId,
      traceId,
      observationId,
      environment,
      effectiveCorrection,
    });

  // Manage editor state & debouncing
  const {
    isEditing,
    value,
    textareaRef,
    handleEdit,
    handleChange,
    handleBlur,
  } = useCorrectionEditor({
    correctionValue,
    actualOutput,
    onSave: handleSave,
    setSaveStatus,
  });

  const hasContent = value.trim().length > 0;

  return (
    <div className="px-2">
      <div className="group relative rounded-md">
        <div className="flex items-center justify-between bg-muted/30 py-1.5">
          <span className="text-sm font-medium">Corrected Output</span>
          <div className="-mr-1 flex items-center -space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
            {saveStatus === "saving" && (
              <span className="mr-2 text-xs text-muted-foreground">
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="mr-2 text-xs">Saved ✓</span>
            )}
            {hasContent && !isEditing && (
              <>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleEdit}
                  className="hover:bg-border"
                  title="Edit corrected output"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleDelete}
                  className="hover:bg-border"
                  title="Delete corrected output"
                >
                  <Trash className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>

        {!hasContent && !isEditing ? (
          <button
            onClick={handleEdit}
            className={cn(
              "w-full cursor-pointer rounded-md border px-3 py-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50",
            )}
          >
            Click to add corrected output
          </button>
        ) : isEditing ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            className="w-full resize-none rounded-b-md border bg-accent-light-green p-3 font-mono text-xs focus:outline-none focus:ring-0"
            rows={Math.min(20, Math.max(10, value.split("\n").length + 2))}
            placeholder="Enter corrected output as JSON..."
          />
        ) : (
          <pre className="w-full overflow-x-auto rounded-md border bg-accent-light-green p-3 font-mono text-xs">
            {value}
          </pre>
        )}
      </div>
    </div>
  );
}
