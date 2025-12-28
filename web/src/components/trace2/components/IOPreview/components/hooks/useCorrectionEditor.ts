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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local value with correctionValue from cache/server
  // Only update if the values are different (prevents overwriting user's current typing)
  useEffect(() => {
    setValue((currentValue) => {
      // Only update if correctionValue is different from current local value
      return currentValue === correctionValue ? currentValue : correctionValue;
    });
  }, [correctionValue]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    // Prepopulate with actual output if no existing correction
    if (!value && actualOutput) {
      try {
        setValue(JSON.stringify(actualOutput, null, 2));
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
      setSaveStatus("saving");

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounced save - triggers mutation (which updates cache) after 500ms
      timeoutRef.current = setTimeout(() => {
        onSave(newValue);
      }, debounceMs);
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
    textareaRef,
    handleEdit,
    handleChange,
    handleBlur,
  };
}
