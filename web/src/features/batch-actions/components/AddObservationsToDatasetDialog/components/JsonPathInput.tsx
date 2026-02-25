import { useState, useCallback, useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";
import { useTheme } from "next-themes";
import { lightTheme } from "@/src/components/editor/light-theme";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { cn } from "@/src/utils/tailwind";
import { evaluateJsonPath } from "@langfuse/shared";

// JSON path language mode for syntax highlighting
const jsonPathLanguage = StreamLanguage.define({
  name: "jsonpath",
  startState: () => ({ inBracket: false }),
  token: (stream: StringStream, state: { inBracket: boolean }) => {
    // Root $ symbol
    if (stream.match("$")) {
      return "keyword";
    }

    // Dot accessor
    if (stream.match(".")) {
      return "punctuation";
    }

    // Array bracket start
    if (stream.match("[")) {
      state.inBracket = true;
      return "bracket";
    }

    // Array bracket end
    if (stream.match("]")) {
      state.inBracket = false;
      return "bracket";
    }

    // Wildcard
    if (stream.match("*")) {
      return "keyword";
    }

    // Number (array index)
    if (state.inBracket && stream.match(/\d+/)) {
      return "number";
    }

    // Property name
    if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return "variable";
    }

    // Skip unknown characters
    stream.next();
    return null;
  },
});

type JsonPathInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  sourceData: unknown;
  placeholder?: string;
  error?: string;
  className?: string;
};

export function JsonPathInput({
  value,
  onChange,
  onBlur,
  sourceData,
  placeholder = "$.path.to.field",
  error,
  className,
}: JsonPathInputProps) {
  const { resolvedTheme } = useTheme();
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  const [resolveError, setResolveError] = useState<string | null>(null);
  const [noMatchWarning, setNoMatchWarning] = useState(false);

  // Parse source data once
  const parsedSourceData = useMemo(() => {
    if (sourceData === null || sourceData === undefined) {
      return null;
    }
    if (typeof sourceData === "string") {
      try {
        return JSON.parse(sourceData);
      } catch {
        return sourceData;
      }
    }
    return sourceData;
  }, [sourceData]);

  // Update resolved value when input changes
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);

      // Try to resolve the JSON path
      if (newValue && newValue.startsWith("$") && parsedSourceData) {
        try {
          const result = evaluateJsonPath(parsedSourceData, newValue);
          setResolveError(null);
          setNoMatchWarning(result === undefined);
        } catch (e) {
          setResolveError(e instanceof Error ? e.message : "Invalid JSON path");
          setNoMatchWarning(false);
        }
      } else {
        setResolveError(null);
        setNoMatchWarning(false);
      }
    },
    [onChange, parsedSourceData],
  );

  const displayError = error || resolveError;
  const showWarning = !displayError && noMatchWarning;

  return (
    <div className="space-y-1">
      <CodeMirror
        value={value}
        theme={codeMirrorTheme}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
        }}
        extensions={[
          EditorView.theme({
            "&.cm-focused": {
              outline: "none",
            },
            ".cm-content": {
              padding: "8px 12px",
              minHeight: "36px",
            },
            ".cm-line": {
              padding: 0,
            },
            ".cm-scroller": {
              overflow: "auto",
            },
          }),
          jsonPathLanguage,
          EditorView.lineWrapping,
        ]}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          "overflow-hidden rounded-md border text-sm",
          displayError && "border-destructive",
          showWarning && "border-amber-500/50",
          className,
        )}
      />
      {displayError && (
        <p className="text-xs text-destructive">{displayError}</p>
      )}
      {showWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          No match found in source data
        </p>
      )}
    </div>
  );
}
