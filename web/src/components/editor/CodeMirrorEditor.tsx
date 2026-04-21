import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { SearchQuery, search, setSearchQuery } from "@codemirror/search";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, type Diagnostic } from "@codemirror/lint";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import {
  useState,
  useCallback,
  type MutableRefObject,
  type RefObject,
} from "react";
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

// Add custom search highlight decoration using the same class names as the default search match decorations
// See: https://github.com/codemirror/search/blob/36e8f21e070d471fcbe2e2f338ef4e647b492ba8/src/search.ts#L396
const searchMatchMark = Decoration.mark({
  class: "cm-searchMatch",
});
const selectedSearchMatchMark = Decoration.mark({
  class: "cm-searchMatch cm-searchMatch-selected",
});

const setSearchHighlightMarks = StateEffect.define<
  {
    from: number;
    to: number;
  }[]
>({
  map: (ranges, change) =>
    ranges.map(({ from, to }) => ({
      from: change.mapPos(from),
      to: change.mapPos(to),
    })),
});

const setSelectedSearchHighlightMark = StateEffect.define<{
  from: number;
  to: number;
}>({
  map: ({ from, to }, change) => ({
    from: change.mapPos(from),
    to: change.mapPos(to),
  }),
});

const unsetSelectedSearchHighlightMark = StateEffect.define({});

const searchHighlightingSupport = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchHighlightMarks)) {
        // Remove all existing search highlights
        decos = decos.update({
          filter: (from, to, decoration) => {
            return !decoration.spec.class?.includes("cm-searchMatch");
          },
        });

        decos = decos.update({
          add: effect.value.map(({ from, to }) =>
            searchMatchMark.range(from, to),
          ),
        });
      }

      if (effect.is(unsetSelectedSearchHighlightMark)) {
        let selectedRange: { from: number; to: number } | null = null;
        decos = decos.update({
          filter: (from, to, decoration) => {
            if (decoration.spec.class?.includes("cm-searchMatch-selected")) {
              selectedRange = { from, to };
              return false;
            }
            return true;
          },
        });

        // Reassign the value and cast it because typescript infers it to be always null,
        // not recognizing it to be assigned in the filter above.
        selectedRange = selectedRange as {
          from: number;
          to: number;
        } | null;

        if (selectedRange) {
          decos = decos.update({
            add: [searchMatchMark.range(selectedRange.from, selectedRange.to)],
          });
        }
      }

      if (effect.is(setSelectedSearchHighlightMark)) {
        // Remove normal search match mark from the selected range,
        // otherwise there will _both_ a normal and selected highlight on the active match.
        decos = decos.update({
          filter: (from, to, decoration) => {
            if (from === effect.value.from && to === effect.value.to) {
              return !decoration.spec.class?.includes("cm-searchMatch");
            }

            return true;
          },
        });

        let previousSelectedRange: { from: number; to: number } | null = null;

        // Make the existing selected search highlight a normal search highlight
        decos = decos.update({
          filter: (from, to, decoration) => {
            if (decoration.spec.class?.includes("cm-searchMatch-selected")) {
              previousSelectedRange = { from, to };
              return false;
            }

            return true;
          },
        });

        // Reassign the value and cast it because typescript infers it to be always null,
        // not recognizing it to be assigned in the filter above.
        previousSelectedRange = previousSelectedRange as {
          from: number;
          to: number;
        } | null;

        decos = decos.update({
          add: [
            ...(previousSelectedRange
              ? [
                  searchMatchMark.range(
                    previousSelectedRange.from,
                    previousSelectedRange.to,
                  ),
                ]
              : []),
            selectedSearchMatchMark.range(effect.value.from, effect.value.to),
          ].toSorted((a, b) => a.from - b.from),
        });
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function applyCodeMirrorSearchQuery(
  editorRef: RefObject<ReactCodeMirrorRef | null> | undefined,
  searchValue: string,
  matchRanges: { from: number; to: number }[],
) {
  const view = editorRef?.current?.view;
  if (!view) {
    return;
  }

  const searchQuery = new SearchQuery({
    search: searchValue,
    caseSensitive: false,
    literal: true,
  });

  view.dispatch({
    effects: setSearchQuery.of(searchQuery),
  });

  view.dispatch({
    effects: setSearchHighlightMarks.of(matchRanges),
  });
}

export function setActiveSearchMarkCodeMirrorRange(
  editorRef: RefObject<ReactCodeMirrorRef | null> | undefined,
  range: { from: number; to: number } | null,
  { scrollIntoView = true }: { scrollIntoView?: boolean } = {},
) {
  const view = editorRef?.current?.view;
  if (!view || !range) {
    return;
  }

  const effects: StateEffect<unknown>[] = [
    setSelectedSearchHighlightMark.of(range),
  ];

  if (scrollIntoView) {
    effects.push(EditorView.scrollIntoView(range.from));
  }

  view.dispatch({
    effects,
  });
}

export function unsetActiveSearchMarkCodeMirrorRange(
  editorRef: RefObject<ReactCodeMirrorRef | null> | undefined,
) {
  const view = editorRef?.current?.view;
  if (!view) {
    return;
  }

  view.dispatch({
    effects: unsetSelectedSearchHighlightMark.of(null),
  });
}

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
  enableSearchKeymap = true,
  onEditorMount,
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
  editorRef?: RefObject<ReactCodeMirrorRef | null>;
  enableSearchKeymap?: boolean;
  onEditorMount?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  // used to disable linter when field is empty
  const [linterEnabled, setLinterEnabled] = useState<boolean>(
    !!value && value !== "",
  );

  const handleEditorRef = useCallback(
    (instance: ReactCodeMirrorRef | null) => {
      if (editorRef) {
        (editorRef as MutableRefObject<ReactCodeMirrorRef | null>).current =
          instance;
      }

      if (instance) {
        onEditorMount?.();
      }
    },
    [editorRef, onEditorMount],
  );

  return (
    <CodeMirror
      value={value}
      theme={codeMirrorTheme}
      ref={editorRef || onEditorMount ? handleEditorRef : undefined}
      basicSetup={{
        foldGutter: lineNumbers,
        highlightActiveLine: false,
        lineNumbers: lineNumbers,
        searchKeymap: enableSearchKeymap,
      }}
      lang={mode === "json" ? "json" : undefined}
      extensions={[
        // Block document changes (including paste) when not editable; the
        // `editable` DOM facet alone does not always prevent paste (see CM6
        // EditorState.readOnly vs EditorView.editable).
        ...(!editable ? [EditorState.readOnly.of(true)] : []),
        searchHighlightingSupport,
        search(),
        // RTL/bidi support - must be early for proper line decoration
        ...bidiSupport,
        // Remove outline if field is focussed
        EditorView.theme({
          "&.cm-focused": {
            outline: "none",
          },
        }),
        // Update search match highlight styles
        EditorView.theme({
          ".cm-searchMatch.cm-searchMatch": {
            backgroundColor: "hsl(var(--find-match-background))",
          },
          ".cm-searchMatch.cm-searchMatch-selected": {
            backgroundColor: "hsl(var(--find-match-selected-background))",
            color: "hsl(var(--find-match-selected-foreground))",
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
