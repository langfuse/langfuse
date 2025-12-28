import { useState, useRef, useEffect, useCallback } from "react";

interface UseCorrectionEditorParams {
  correctionValue: string;
  actualOutput: unknown;
  onSave: (value: string) => void;
  setSaveStatus: (status: "idle" | "saving" | "saved") => void;
  debounceMs?: number;
}

/**
 * Manages correction editor state, debouncing, and auto-save
 */
export function useCorrectionEditor({
  correctionValue,
  actualOutput,
  onSave,
  setSaveStatus,
  debounceMs = 500,
}: UseCorrectionEditorParams) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(correctionValue);
  const [isValidJson, setIsValidJson] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local value with correctionValue from cache/server
  // This includes handling deletions (correctionValue becomes empty string)
  useEffect(() => {
    setValue(correctionValue);
  }, [correctionValue]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    // Prepopulate with actual output if no existing correction
    if (!value && actualOutput) {
      try {
        // Store as JSON string (not stringified string)
        const jsonValue =
          typeof actualOutput === "string"
            ? actualOutput
            : JSON.stringify(actualOutput);
        setValue(jsonValue);
      } catch {
        setValue(String(actualOutput));
      }
    }
    // Focus textarea after it renders
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value, actualOutput]);

  const handleChange = useCallback(
    (newValue: string) => {
      // Update local state immediately for responsive typing
      setValue(newValue);

      // Validate JSON
      let valid = false;
      try {
        if (newValue.trim()) {
          JSON.parse(newValue);
          valid = true;
        }
      } catch {
        valid = false;
      }
      setIsValidJson(valid);

      // Only save if valid JSON
      if (valid) {
        setSaveStatus("saving");

        // Clear existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Debounced save - triggers mutation (which updates cache) after 500ms
        timeoutRef.current = setTimeout(() => {
          onSave(newValue);
        }, debounceMs);
      } else {
        setSaveStatus("idle");
        // Clear timeout if JSON becomes invalid
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    },
    [onSave, setSaveStatus, debounceMs],
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // Note: Local value persists after blur. It will only update when cache/server value changes.
  }, []);

  return {
    isEditing,
    value,
    isValidJson,
    textareaRef,
    handleEdit,
    handleChange,
    handleBlur,
  };
}
