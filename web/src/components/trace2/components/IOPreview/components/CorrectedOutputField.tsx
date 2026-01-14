import { Pencil, Trash, FileDiff } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { type ScoreDomain } from "@langfuse/shared";
import { useCorrectionData } from "./hooks/useCorrectionData";
import { useCorrectionMutations } from "./hooks/useCorrectionMutations";
import { useCorrectionEditor } from "./hooks/useCorrectionEditor";
import { useMemo, useState } from "react";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Switch } from "@/src/components/ui/switch";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CorrectedOutputDiffDialog } from "./CorrectedOutputDiffDialog";

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
  const hasAccess = useHasProjectAccess({ projectId, scope: "scores:CUD" });

  // JSON validation toggle (persisted in localStorage)
  const [strictJsonMode, setStrictJsonMode] = useLocalStorage(
    "correctionStrictJsonMode",
    false,
  );

  // Diff dialog state
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);

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
  const {
    isEditing,
    setIsEditing,
    value,
    isValidJson,
    handleEdit,
    handleChange,
  } = useCorrectionEditor({
    correctionValue,
    actualOutput,
    onSave: handleSave,
    setSaveStatus,
    strictJsonMode,
  });

  // When not editing, use correctionValue (source of truth from cache/server)
  // When editing, use value (local state)
  const hasContent = isEditing
    ? value.trim().length > 0
    : correctionValue.trim().length > 0;

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

  const handleDeleteWithExitEdit = () => {
    handleDelete();
    setIsEditing(false);
  };

  return (
    <>
      <CorrectedOutputDiffDialog
        isOpen={isDiffDialogOpen}
        setIsOpen={setIsDiffDialogOpen}
        actualOutput={actualOutput}
        correctedOutput={value}
        strictJsonMode={strictJsonMode}
      />
      <div className="px-2">
        <div className="group relative rounded-md">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm font-medium">Corrected Output (Beta)</span>
            <div className="-mr-1 flex items-center">
              <div className="flex items-center -space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!isValidJson && isEditing && hasContent && (
                  <span className="mr-2 text-xs text-red-500">
                    {strictJsonMode
                      ? "Invalid JSON - fix to save"
                      : "Cannot save empty content"}
                  </span>
                )}
                {isValidJson && saveStatus === "saving" && (
                  <span className="mr-2 w-fit text-xs text-muted-foreground">
                    Saving...
                  </span>
                )}
                {isValidJson && saveStatus === "saved" && (
                  <span className="mr-2 w-fit text-xs">Saved ✓</span>
                )}
                {hasContent && (
                  <>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setIsDiffDialogOpen(true)}
                      className="hover:bg-border"
                      title={"View diff between original and corrected output"}
                    >
                      <FileDiff className="h-3 w-3" />
                    </Button>
                    {!isEditing && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={handleEdit}
                        disabled={!hasAccess}
                        className="hover:bg-border"
                        title="Edit corrected output"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={handleDeleteWithExitEdit}
                      disabled={!hasAccess}
                      className="hover:bg-border"
                      title="Delete corrected output"
                    >
                      <Trash className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center">
                <Switch
                  checked={strictJsonMode}
                  onCheckedChange={setStrictJsonMode}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground">JSON</span>
              </div>
            </div>
          </div>

          {!hasContent && !isEditing ? (
            <button
              onClick={handleEdit}
              disabled={!hasAccess}
              className={cn(
                "w-full cursor-pointer rounded-md border px-3 py-4 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/50",
              )}
            >
              Click to add corrected output
            </button>
          ) : isEditing ? (
            <CodeMirrorEditor
              value={displayValue}
              onChange={handleEditorChange}
              mode={strictJsonMode ? "json" : "text"}
              minHeight={200}
              placeholder="Enter corrected output..."
              className="bg-accent-light-green"
            />
          ) : (
            <CodeMirrorEditor
              value={displayValue}
              mode={strictJsonMode ? "json" : "text"}
              minHeight={200}
              editable={false}
              className="bg-accent-light-green"
            />
          )}
        </div>
      </div>
    </>
  );
}
