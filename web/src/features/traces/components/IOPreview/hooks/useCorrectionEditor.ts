import { useState, useRef, useEffect, useCallback } from "react";

interface UseCorrectionEditorParams {
  correctionValue: string;
  actualOutput: unknown;
  onSave: (value: string) => void;
  setSaveStatus: (status: "idle" | "saving" | "saved") => void;
  debounceMs?: number;
  strictJsonMode?: boolean;
  /** Mount in edit mode, prefilled from `actualOutput` when there is no
      correction yet; nothing is saved until the user types. */
  initialEditing?: boolean;
}

/** The actual output as the editor's starting text. */
function serializeActualOutput(actualOutput: unknown): string {
  try {
    return typeof actualOutput === "string"
      ? actualOutput
      : JSON.stringify(actualOutput);
  } catch {
    return String(actualOutput);
  }
}

function isValidValue(value: string, strictJsonMode: boolean): boolean {
  if (!strictJsonMode) return value.trim().length > 0;
  try {
    if (!value.trim()) return false;
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
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
  strictJsonMode = false,
  initialEditing = false,
}: UseCorrectionEditorParams) {
  const [isEditing, setIsEditing] = useState(initialEditing);
  const [value, setValue] = useState(() =>
    initialEditing && !correctionValue && actualOutput
      ? serializeActualOutput(actualOutput)
      : correctionValue,
  );
  const [isValidJson, setIsValidJson] = useState(() =>
    initialEditing ? isValidValue(value, strictJsonMode) : true,
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local value with correctionValue from cache/server
  // This includes handling deletions (correctionValue becomes empty string)
  const syncedCorrectionValue = useRef(correctionValue);
  useEffect(() => {
    if (syncedCorrectionValue.current === correctionValue) return;
    syncedCorrectionValue.current = correctionValue;
    setValue(correctionValue);
  }, [correctionValue]);

  useEffect(() => {
    let valid = false;
    if (strictJsonMode) {
      try {
        if (value.trim()) {
          JSON.parse(value);
          valid = true;
        }
      } catch {
        valid = false;
      }
    } else {
      valid = value.trim().length > 0;
    }
    setIsValidJson(valid);
    // We only need to re-validate when strictJsonMode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strictJsonMode]);

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

        // Validate the prefilled value
        let valid = false;
        if (strictJsonMode) {
          try {
            if (jsonValue.trim()) {
              JSON.parse(jsonValue);
              valid = true;
            }
          } catch {
            valid = false;
          }
        } else {
          valid = jsonValue.trim().length > 0;
        }
        setIsValidJson(valid);

        // Auto-save prefilled value if valid
        if (valid) {
          setSaveStatus("saving");
          onSave(jsonValue);
        }
      } catch {
        const stringValue = String(actualOutput);
        setValue(stringValue);
        const valid = stringValue.trim().length > 0;
        setIsValidJson(valid);
        if (valid) {
          setSaveStatus("saving");
          onSave(stringValue);
        }
      }
    }
    // Focus textarea after it renders
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value, actualOutput, strictJsonMode, onSave, setSaveStatus]);

  const handleChange = useCallback(
    (newValue: string) => {
      // Update local state immediately for responsive typing
      setValue(newValue);

      // Validate based on mode
      let valid = false;
      if (strictJsonMode) {
        // Strict: only valid JSON
        try {
          if (newValue.trim()) {
            JSON.parse(newValue);
            valid = true;
          }
        } catch {
          valid = false;
        }
      } else {
        // Lenient: any non-empty string
        valid = newValue.trim().length > 0;
      }
      setIsValidJson(valid);

      // Save if valid
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
        // Clear timeout if invalid
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    },
    [onSave, setSaveStatus, debounceMs, strictJsonMode],
  );

  return {
    isEditing,
    setIsEditing,
    value,
    isValidJson,
    handleEdit,
    handleChange,
  };
}
