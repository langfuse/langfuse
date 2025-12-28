import { Pencil, Trash } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { type ScoreDomain } from "@langfuse/shared";
import { useCorrectionData } from "./hooks/useCorrectionData";
import { useCorrectionMutations } from "./hooks/useCorrectionMutations";
import { useCorrectionEditor } from "./hooks/useCorrectionEditor";
import { useMemo } from "react";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";

interface CorrectedOutputFieldProps {
  projectId: string;
  traceId: string;
  environment: string;
  actualOutput?: unknown;
  existingCorrection?: ScoreDomain | null;
  observationId?: string;
}

export function CorrectedOutputField({
  actualOutput,
  existingCorrection,
  observationId,
  projectId,
  traceId,
  environment = "default",
}: CorrectedOutputFieldProps) {
  // Merge cache + server data
  const { effectiveCorrection, correctionValue } = useCorrectionData(
    existingCorrection,
    observationId,
    traceId,
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
  const { isEditing, value, isValidJson, handleEdit, handleChange } =
    useCorrectionEditor({
      correctionValue,
      actualOutput,
      onSave: handleSave,
      setSaveStatus,
    });

  const hasContent = value.trim().length > 0;

  // Format JSON for display
  const displayValue = useMemo(() => {
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If JSON parsing fails, return the raw value (don't clear it)
      return value;
    }
  }, [value]);

  const handleEditorChange = (newValue: string) => {
    handleChange(newValue);
  };

  return (
    <div className="px-2">
      <div className="group relative rounded-md">
        <div className="flex items-center justify-between bg-muted/30 py-1.5">
          <span className="text-sm font-medium">Corrected Output (Beta)</span>
          <div className="-mr-1 flex items-center -space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!isValidJson && isEditing && hasContent && (
              <span className="mr-2 text-xs text-red-500">
                Invalid JSON - fix to save
              </span>
            )}
            {isValidJson &&
              saveStatus === "idle" &&
              isEditing &&
              hasContent && (
                <span className="mr-2 text-xs text-muted-foreground">
                  DRAFT - Type any character to save
                </span>
              )}
            {isValidJson && saveStatus === "saving" && (
              <span className="mr-2 text-xs text-muted-foreground">
                Saving...
              </span>
            )}
            {isValidJson && saveStatus === "saved" && (
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
          <CodeMirrorEditor
            value={displayValue}
            onChange={handleEditorChange}
            mode="json"
            minHeight={200}
            placeholder="Enter corrected output as JSON..."
            className="bg-accent-light-green"
          />
        ) : (
          <CodeMirrorEditor
            value={displayValue}
            mode="json"
            minHeight={200}
            editable={false}
            className="bg-accent-light-green"
          />
        )}
      </div>
    </div>
  );
}
