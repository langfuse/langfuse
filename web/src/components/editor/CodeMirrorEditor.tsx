import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, type Diagnostic } from "@codemirror/lint";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";
import {
  isValidVariableName,
  MULTILINE_VARIABLE_REGEX,
  MUSTACHE_REGEX,
  UNCLOSED_VARIABLE_REGEX,
} from "@langfuse/shared";
import { lightTheme } from "@/src/components/editor/light-theme";
import { darkTheme } from "@/src/components/editor/dark-theme";

// Custom language mode for prompts that highlights mustache variables
const promptLanguage = StreamLanguage.define({
  name: "prompt",
  startState: () => ({}),
  token: (stream: StringStream) => {
    if (stream.match("{{")) {
      const start = stream.pos;
      stream.skipTo("}}") || stream.skipToEnd();
      const content = stream.string.slice(start, stream.pos);
      stream.match("}}");
      return isValidVariableName(content) ? "variable" : "error";
    }
    stream.next();
    return null;
  },
});

// Linter for prompt variables
const promptLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const content = view.state.doc.toString();

  // Check for multiline variables
  for (const match of content.matchAll(MULTILINE_VARIABLE_REGEX)) {
    diagnostics.push({
      from: match.index,
      to: match.index + match[0].length,
      severity: "error",
      message: "Variables cannot span multiple lines",
    });
  }

  // Check for unclosed variables
  for (const match of content.matchAll(UNCLOSED_VARIABLE_REGEX)) {
    diagnostics.push({
      from: match.index,
      to: match.index + 2,
      severity: "error",
      message: "Unclosed variable brackets",
    });
  }

  // Check variable format
  for (const match of content.matchAll(MUSTACHE_REGEX)) {
    const variable = match[1];
    if (!variable || variable.trim() === "") {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "error",
        message: "Empty variable is not allowed",
      });
    } else if (!isValidVariableName(variable)) {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "error",
        message:
          "Variable must start with a letter and can only contain letters and underscores",
      });
    }
  }

  return diagnostics;
});

// Create a language support instance that combines the language and its configuration
const promptSupport = new LanguageSupport(promptLanguage);

export function CodeMirrorEditor({
  value,
  onChange,
  editable = true,
  lineWrapping = true,
  lineNumbers = true,
  className,
  onBlur,
  mode,
  minHeight,
  placeholder,
}: {
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  onBlur?: () => void;
  lineNumbers?: boolean;
  lineWrapping?: boolean;
  className?: string;
  mode: "json" | "text" | "prompt";
  minHeight: "none" | 30 | 100 | 200;
  placeholder?: string;
}) {
  const { resolvedTheme } = useTheme();
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  // used to disable linter when field is empty
  const [linterEnabled, setLinterEnabled] = useState<boolean>(
    !!value && value !== "",
  );

  return (
    <CodeMirror
      value={value}
      theme={codeMirrorTheme}
      basicSetup={{
        foldGutter: lineNumbers,
        highlightActiveLine: false,
        lineNumbers: lineNumbers,
      }}
      lang={mode === "json" ? "json" : undefined}
      extensions={[
        // Hide gutter when lineNumbers is false
        // Fix missing gutter border
        ...(!lineNumbers
          ? [
              EditorView.theme({
                ".cm-gutters": { display: "none" },
              }),
            ]
          : [
              EditorView.theme({
                ".cm-gutters": { borderRight: "1px solid" },
              }),
            ]),
        // Extend gutter to full height when minHeight > content height
        // This also enlarges the text area to minHeight
        ...(minHeight === "none"
          ? []
          : [
              EditorView.theme({
                ".cm-gutter,.cm-content": { minHeight: `${minHeight}px` },
                ".cm-scroller": { overflow: "auto" },
              }),
            ]),
        ...(mode === "json" ? [json()] : []),
        ...(mode === "json" && linterEnabled
          ? [linter(jsonParseLinter())]
          : []),
        ...(mode === "prompt" ? [promptSupport, promptLinter] : []),
        ...(lineWrapping ? [EditorView.lineWrapping] : []),
      ]}
      defaultValue={value}
      onChange={(c) => {
        if (onChange) onChange(c);
        setLinterEnabled(c !== "");
      }}
      onBlur={onBlur}
      className={cn(
        "overflow-hidden overflow-y-auto rounded-md border text-xs",
        className,
      )}
      editable={editable}
      placeholder={placeholder}
    />
  );
}
