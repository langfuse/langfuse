import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { RangeSetBuilder } from "@codemirror/state";
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
  PromptDependencyRegex,
  parsePromptDependencyTags,
} from "@langfuse/shared";
import { lightTheme } from "@/src/components/editor/light-theme";
import { darkTheme } from "@/src/components/editor/dark-theme";

// Custom language mode for prompts that highlights mustache variables and prompt dependency tags
const promptLanguage = StreamLanguage.define({
  name: "prompt",
  startState: () => ({}),
  token: (stream: StringStream) => {
    // Highlight prompt tags
    if (stream.match("@@@langfusePrompt:")) {
      stream.skipTo("@@@") || stream.skipToEnd();
      stream.match("@@@");

      return "keyword";
    }

    // Highlight mustache variables
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

  // Check for malformed prompt dependency tags
  for (const match of content.matchAll(PromptDependencyRegex)) {
    const tagContent = match[0];
    try {
      const parsedTags = parsePromptDependencyTags(tagContent);

      if (parsedTags.length === 0) {
        diagnostics.push({
          from: match.index,
          to: match.index + match[0].length,
          severity: "warning",
          message: "Malformed prompt dependency tag",
        });
      }
    } catch {
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: "warning",
        message: "Invalid prompt dependency tag format",
      });
    }
  }

  return diagnostics;
});

// Create a language support instance that combines the language and its configuration
const promptSupport = new LanguageSupport(promptLanguage);

// RTL/bidirectional text support
const dirAutoDecoration = Decoration.line({ attributes: { dir: "auto" } });

const bidiSupport = [
  EditorView.perLineTextDirection.of(true),
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const { from, to } of view.visibleRanges) {
          for (let pos = from; pos <= to; ) {
            const line = view.state.doc.lineAt(pos);
            builder.add(line.from, line.from, dirAutoDecoration);
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  ),
];

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
  maxHeight,
  placeholder,
  editorRef,
}: {
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  onBlur?: () => void;
  lineNumbers?: boolean;
  lineWrapping?: boolean;
  className?: string;
  mode: "json" | "text" | "prompt";
  minHeight?: number | string;
  maxHeight?: number | string;
  placeholder?: string;
  editorRef?: React.RefObject<ReactCodeMirrorRef | null>;
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
      ref={editorRef}
      basicSetup={{
        foldGutter: lineNumbers,
        highlightActiveLine: false,
        lineNumbers: lineNumbers,
      }}
      lang={mode === "json" ? "json" : undefined}
      extensions={[
        // RTL/bidi support - must be early for proper line decoration
        ...bidiSupport,
        // Remove outline if field is focussed
        EditorView.theme({
          "&.cm-focused": {
            outline: "none",
          },
        }),
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
        ...(!!minHeight
          ? [
              EditorView.theme({
                ".cm-gutter,.cm-content": {
                  minHeight:
                    typeof minHeight === "number"
                      ? `${minHeight}px`
                      : minHeight,
                },
                ".cm-scroller": { overflow: "auto" },
              }),
            ]
          : []),
        // Add max height support for very long bodies of text
        ...(!!maxHeight
          ? [
              EditorView.theme({
                ".cm-scroller": {
                  maxHeight:
                    typeof maxHeight === "number"
                      ? `${maxHeight}px`
                      : maxHeight,
                },
              }),
            ]
          : []),
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
