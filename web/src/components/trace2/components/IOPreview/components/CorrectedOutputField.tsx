import { Pencil, Trash, FileDiff, Loader2, Check, Info } from "lucide-react";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import Link from "next/link";

interface CorrectedOutputFieldProps {
  projectId: string;
  traceId: string;
  environment: string;
  actualOutput?: unknown;
  existingCorrection?: ScoreDomain | null;
  observationId?: string;
  compact?: boolean; // Use smaller font size for JSON Beta view
}

export function CorrectedOutputField({
  actualOutput,
  existingCorrection,
  observationId,
  projectId,
  traceId,
  environment = "default",
  compact = false,
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

  // Get display value based on mode
  // In text mode: unwrap JSON strings for easier editing
  // In JSON mode: show raw JSON
  const displayValue = useMemo(() => {
    if (!value) return "";

    if (strictJsonMode) {
      // JSON mode: format JSON nicely
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON, return as-is
        return value;
      }
    } else {
      // Text mode: unwrap if it's a JSON string
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "string") {
          // It's a JSON-encoded string, show unwrapped
          return parsed;
        }
        // It's an object/array, format nicely
        return JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON, return as-is
        return value;
      }
    }
  }, [value, strictJsonMode]);

  const handleEditorChange = (newValue: string) => {
    handleChange(newValue);
  };

  const handleStrictJsonModeChange = (isStrictJsonMode: boolean) => {
    setStrictJsonMode(isStrictJsonMode);

    // Smart conversion only when toggling modes
    if (!isEditing || !value.trim()) return;

    if (isStrictJsonMode) {
      // Switching TO JSON mode: wrap plain text, keep JSON objects/arrays
      try {
        JSON.parse(value);
        // Already valid JSON, keep as-is
      } catch {
        // Not valid JSON, wrap as string and update
        const wrappedValue = JSON.stringify(value);
        handleChange(wrappedValue);
      }
    }
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
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "text-sm font-medium",
                  compact ? "text-xs" : "text-sm",
                )}
              >
                {compact ? "" : "Corrected Output (Beta)"}
              </span>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80 text-xs" side="right">
                  <p>
                    Corrected outputs allow you to save the expected output for
                    a trace or observation. Learn more in the{" "}
                    <Link
                      href="https://langfuse.com/docs/observability/features/corrections"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground"
                    >
                      documentation
                    </Link>
                    .
                  </p>
                </HoverCardContent>
              </HoverCard>
            </div>
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
                  <div className="mr-2 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs text-muted-foreground">
                      Saving
                    </span>
                  </div>
                )}
                {isValidJson && saveStatus === "saved" && (
                  <div className="mr-2 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">Saved</span>
                  </div>
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
                  onCheckedChange={handleStrictJsonModeChange}
                  disabled={!isEditing}
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
