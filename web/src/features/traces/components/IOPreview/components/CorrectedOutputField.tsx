import { Pencil, Trash, FileDiff } from "@langfuse/icons";
import {
  IOSection,
  type IOSectionAction,
  type IOSectionInfo,
  type IOSectionStatus,
  type IOSectionToggle,
} from "@/src/components/ui/IOSection";
import { type ScoreDomain } from "@langfuse/shared";
import { useCorrectionData } from "../hooks/useCorrectionData";
import { useCorrectionMutations } from "../hooks/useCorrectionMutations";
import { useCorrectionEditor } from "../hooks/useCorrectionEditor";
import { useCallback, useMemo, useRef, useState } from "react";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useScoreEditsDisabled } from "@/src/features/scores/hooks/useScoreEditsDisabled";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CorrectedOutputDiffDialog } from "./CorrectedOutputDiffDialog";

interface CorrectedOutputFieldProps {
  projectId: string;
  traceId: string;
  environment: string;
  actualOutput?: unknown;
  /**
   * True when the original output exists but was gated out of the view for
   * being too large. It is then unavailable as `actualOutput`, but that must
   * not be reported to the user as "no original output".
   */
  actualOutputTooLarge?: boolean;
  existingCorrection?: ScoreDomain | null;
  observationId?: string;
  compact?: boolean; // Use smaller font size for JSON Beta view
  /** `header`: the host renders `CorrectOutputButton` in the Output header
      and mounts this field only while open or when a correction exists, so
      the field has no trigger of its own. */
  trigger?: "inline" | "header";
  /** Mount straight into the editor (header mode, no correction yet). */
  startEditing?: boolean;
  /** Called when the section closes again (correction deleted). */
  onClosed?: () => void;
}

/** The Output header's pencil: opens the correction editor. Disabled without
    `scores:save`, like the section's own edit and delete actions. */
export function useCorrectOutputAction({
  projectId,
  onOpen,
}: {
  projectId: string;
  onOpen: () => void;
}): IOSectionAction {
  const capture = usePostHogClientCapture();
  const canEdit = useCanEditCorrection(projectId);
  return {
    icon: Pencil,
    label: "Correct output",
    disabled: !canEdit,
    onClick: () => {
      capture("trace_detail:io_section_collapse_toggle", {
        section: "corrected_output",
        collapsed: false,
      });
      onOpen();
    },
  };
}

export function CorrectedOutputField({
  actualOutput,
  actualOutputTooLarge = false,
  existingCorrection,
  observationId,
  projectId,
  traceId,
  environment = "default",
  compact = false,
  trigger = "inline",
  startEditing = false,
  onClosed,
}: CorrectedOutputFieldProps) {
  const hasAccess = useHasProjectAccess({ projectId, scope: "scores:save" });
  const canEdit = useCanEditCorrection(projectId);
  const capture = usePostHogClientCapture();

  // JSON validation toggle (persisted in localStorage)
  const [strictJsonMode, setStrictJsonMode] = useLocalStorage(
    "correctionStrictJsonMode",
    false,
  );

  // Diff dialog state
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);

  // Inline mode: no correction keeps the section behind its link until opened.
  // Header mode: the host mounts this field only when it should show.
  const [internalExpanded, setIsExpanded] = useState(false);
  const isExpanded = trigger === "header" || internalExpanded;
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  // Stable so CodeMirrorEditor's ref callback fires it once per mount.
  const focusEditor = useCallback(() => {
    requestAnimationFrame(() => editorRef.current?.view?.focus());
  }, []);

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
    initialEditing: startEditing && canEdit,
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
    setIsExpanded(false);
    onClosed?.();
  };

  if (!isExpanded && !effectiveCorrection) {
    return (
      <div className="py-2">
        <button
          type="button"
          onClick={() => {
            capture("trace_detail:io_section_collapse_toggle", {
              section: "corrected_output",
              collapsed: false,
            });
            // One click: open the section straight into the editor (readers
            // without scores:save get the disabled placeholder).
            setIsExpanded(true);
            if (canEdit) handleEdit();
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <Pencil size="sm" aria-hidden />
          Correct output
        </button>
      </div>
    );
  }

  const status = getStatus({
    isEditing,
    hasContent,
    isValidJson,
    saveStatus,
    strictJsonMode,
  });

  const actions: IOSectionAction[] = hasContent
    ? [
        {
          icon: FileDiff,
          label: "View diff between original and corrected output",
          onClick: () => setIsDiffDialogOpen(true),
        },
        ...(!isEditing
          ? [
              {
                icon: Pencil,
                label: "Edit corrected output",
                onClick: handleEdit,
                disabled: !canEdit,
              },
            ]
          : []),
        {
          icon: Trash,
          label: "Delete corrected output",
          onClick: handleDeleteWithExitEdit,
          disabled: !hasAccess,
        },
      ]
    : [];

  const jsonToggle: IOSectionToggle = {
    label: "JSON",
    checked: strictJsonMode,
    onCheckedChange: handleStrictJsonModeChange,
    disabled: !isEditing,
  };

  const info: IOSectionInfo = {
    label: "About corrected outputs",
    text: "Corrected outputs allow you to save the expected output for a trace or observation.",
    docsHref: "https://langfuse.com/docs/observability/features/corrections",
  };

  const body = (
    <CorrectionBody
      hasContent={hasContent}
      isEditing={isEditing}
      hasAccess={canEdit}
      displayValue={displayValue}
      strictJsonMode={strictJsonMode}
      editorRef={editorRef}
      onEdit={handleEdit}
      onChange={handleEditorChange}
      onEditorMount={focusEditor}
    />
  );

  return (
    <>
      <CorrectedOutputDiffDialog
        isOpen={isDiffDialogOpen}
        setIsOpen={setIsDiffDialogOpen}
        actualOutput={actualOutput}
        actualOutputTooLarge={actualOutputTooLarge}
        correctedOutput={value}
        strictJsonMode={strictJsonMode}
      />
      {compact ? (
        // The JSON Beta section renders its own title; only controls + body here.
        <div className="group pt-2">
          <div className="flex items-center justify-between py-1.5">
            <IOSection.InfoButton info={info} />
            <div className="flex items-center -space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
              <IOSection.Controls
                status={status}
                actions={actions}
                toggle={jsonToggle}
              />
            </div>
          </div>
          {body}
        </div>
      ) : (
        <div className="pt-2">
          <IOSection
            title="Corrected output"
            info={info}
            status={status}
            actions={actions.length > 0 ? actions : undefined}
            toggle={jsonToggle}
          >
            {body}
          </IOSection>
        </div>
      )}
    </>
  );
}

function getStatus({
  isEditing,
  hasContent,
  isValidJson,
  saveStatus,
  strictJsonMode,
}: {
  isEditing: boolean;
  hasContent: boolean;
  isValidJson: boolean;
  saveStatus: "idle" | "saving" | "saved";
  strictJsonMode: boolean;
}): IOSectionStatus | undefined {
  if (!isValidJson) {
    if (!isEditing || !hasContent) return undefined;
    return {
      kind: "error",
      text: strictJsonMode
        ? "Invalid JSON - fix to save"
        : "Cannot save empty content",
    };
  }
  if (saveStatus === "saving") return { kind: "saving", text: "Saving" };
  if (saveStatus === "saved") return { kind: "saved", text: "Saved" };
  return undefined;
}

/** Placeholder, editor, or read-only view of the correction. */
function CorrectionBody({
  hasContent,
  isEditing,
  hasAccess,
  displayValue,
  strictJsonMode,
  editorRef,
  onEdit,
  onChange,
  onEditorMount,
}: {
  hasContent: boolean;
  isEditing: boolean;
  hasAccess: boolean;
  displayValue: string;
  strictJsonMode: boolean;
  editorRef: React.RefObject<ReactCodeMirrorRef | null>;
  onEdit: () => void;
  onChange: (value: string) => void;
  onEditorMount: () => void;
}) {
  if (!hasContent && !isEditing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        disabled={!hasAccess}
        className="text-muted-foreground hover:text-foreground w-full cursor-pointer text-left text-sm disabled:cursor-not-allowed"
      >
        Click to add corrected output
      </button>
    );
  }
  if (isEditing) {
    return (
      <CodeMirrorEditor
        value={displayValue}
        onChange={onChange}
        mode={strictJsonMode ? "json" : "text"}
        minHeight={200}
        placeholder="Enter corrected output..."
        editorRef={editorRef}
        onEditorMount={onEditorMount}
        appearance="flat"
        className="focus-within:ring-ring focus-within:ring-2"
      />
    );
  }
  return (
    <CodeMirrorEditor
      value={displayValue}
      mode={strictJsonMode ? "json" : "text"}
      editable={false}
      appearance="flat"
    />
  );
}

/** Corrections autosave by rewriting the same score id, which projects that
    read scores without dedup must not do, so editing is off for them. */
function useCanEditCorrection(projectId: string) {
  const hasAccess = useHasProjectAccess({ projectId, scope: "scores:save" });
  const scoreEditsDisabled = useScoreEditsDisabled(projectId);
  return hasAccess && !scoreEditsDisabled;
}
