import { showErrorToast } from "@/src/features/notifications";
import CodeMirror, {
  Decoration,
  EditorView,
  hoverTooltip,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EvalTemplateSourceCodeLanguageEnum } from "@langfuse/shared";
import { useTheme } from "next-themes";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import { autoScrollOnSelectionDrag } from "@/src/components/editor/autoScrollOnSelectionDrag";
import { codeMirrorSearchPanel } from "@/src/constants/codeMirrorSearchPanel";
import {
  getCodeEvalHoverDocs,
  PROPERTY_ACCESS_ONLY_HOVER_KEYS,
  type CodeEvalHoverDocs,
} from "@/src/features/evals/utils/code-eval-template-hover-docs";
import {
  getCodeEvalCompletionExtension,
  isInsideStringOrComment,
} from "@/src/features/evals/utils/code-eval-template-completions";
import {
  formatPythonCodeEvalSourceWithRuff,
  type CodeEvalSourceCodeLanguage,
  type CodeEvalValidationResult,
} from "@/src/features/evals/utils/code-eval-template-validation";

type CodeEvalTemplateFormBodyProps = {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
  onSourceCodeChange: (value: string) => void;
  editable: boolean;
  validationResult: CodeEvalValidationResult | null;
  ctxSample: string | null;
  headerAction?: ReactNode;
};

const FORMAT_SHORTCUT_ARIA = "Alt+Shift+F";
const FUNCTION_CONTRACT_DOCS_URL =
  "https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators#function-contract";
const CODE_MIRROR_BASIC_SETUP = {
  autocompletion: false,
  completionKeymap: false,
  foldGutter: true,
  highlightActiveLine: false,
  lineNumbers: true,
  searchKeymap: true,
};
const codeMirrorLayoutTheme = EditorView.theme({
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { borderRight: "1px solid" },
  ".cm-scroller": {
    maxHeight: "60dvh",
    overflow: "auto",
  },
});
const ctxMatcher = new MatchDecorator({
  regexp: /\bctx\b/g,
  decorate: (add, from, to, _match, view) => {
    const node = syntaxTree(view.state).resolveInner(from, 1);
    if (isInsideStringOrComment(node)) return;

    add(
      from,
      to,
      Decoration.mark({
        class: "cursor-help underline decoration-dotted underline-offset-2",
        attributes: {
          "aria-label": "Hover to preview the evaluation context",
        },
      }),
    );
  },
});
const ctxHoverAffordanceExtension = ViewPlugin.fromClass(
  class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = ctxMatcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = ctxMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (value) => value.decorations },
);

function createCodeEvalHoverExtension({
  hoverDocs,
  ctxSample,
  languageExtension,
  codeMirrorTheme,
}: {
  hoverDocs: CodeEvalHoverDocs;
  ctxSample: string | null;
  languageExtension: Extension;
  codeMirrorTheme: Extension;
}) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    const offset = pos - line.from;
    const before = text.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0];
    const after = text.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0] ?? "";
    const word = `${before ?? ""}${after}`;
    const hoverDoc = hoverDocs[word];
    if (!word || !hoverDoc) return null;

    const from = pos - (before?.length ?? 0);
    const to = from + word.length;

    const node = syntaxTree(view.state).resolveInner(from, 1);
    if (isInsideStringOrComment(node)) return null;
    // `type`, `index`, ... are ToolCall properties but also everyday
    // identifiers; only document them on actual property accesses.
    if (
      PROPERTY_ACCESS_ONLY_HOVER_KEYS.has(word) &&
      node.name !== "PropertyName"
    ) {
      return null;
    }

    return {
      pos: from,
      end: to,
      create() {
        const dom = document.createElement("div");
        dom.className =
          "max-h-96 max-w-xl overflow-auto overscroll-contain rounded-md border bg-popover px-3 py-2 font-mono text-xs text-popover-foreground shadow-md";
        const documentation = document.createElement("div");
        documentation.className = "whitespace-pre-wrap";
        documentation.textContent = hoverDoc;
        dom.append(documentation);

        if (word !== "ctx" || !ctxSample) return { dom };

        const label = document.createElement("div");
        label.className = "mt-2 mb-1 font-sans font-bold";
        label.textContent = "Selected sample data:";
        dom.append(label);

        const sampleContainer = document.createElement("div");
        sampleContainer.className =
          "min-w-0 rounded border [&_.cm-editor]:bg-transparent";
        dom.append(sampleContainer);
        const sampleEditor = new EditorView({
          doc: ctxSample,
          parent: sampleContainer,
          extensions: [
            languageExtension,
            codeMirrorTheme,
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.lineWrapping,
            EditorView.theme({
              "&.cm-focused": { outline: "none" },
              ".cm-content": { padding: "0.5rem" },
              ".cm-scroller": {
                height: "auto",
                overflowX: "visible",
                overflowY: "visible",
              },
            }),
          ],
        });
        // CodeMirror's base theme makes `.cm-scroller` independently
        // scrollable. This embedded editor is content-sized; the surrounding
        // tooltip is the single scroll container for both docs and sample.
        sampleEditor.dom.style.height = "auto";
        sampleEditor.dom.style.maxHeight = "none";
        sampleEditor.scrollDOM.style.height = "auto";
        sampleEditor.scrollDOM.style.maxHeight = "none";
        sampleEditor.scrollDOM.style.overflow = "visible";

        return { dom, destroy: () => sampleEditor.destroy() };
      },
    };
  });
}

async function formatTypeScriptSource(source: string) {
  // babel-ts instead of the typescript plugin: the latter embeds the
  // TypeScript compiler, which the SWC minifier miscompiles (dropped
  // bindings — LFE-10645, caught by scripts/scan-client-bundle.mjs).
  const [{ format }, babelPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);

  return format(source, {
    parser: "babel-ts",
    plugins: [babelPlugin, estreePlugin],
  });
}

export function CodeEvalTemplateFormBody({
  sourceCode,
  sourceCodeLanguage,
  onSourceCodeChange,
  editable,
  validationResult,
  ctxSample,
  headerAction,
}: CodeEvalTemplateFormBodyProps) {
  const { resolvedTheme } = useTheme();
  const [isFormatting, setIsFormatting] = useState(false);
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  const languageLabel =
    sourceCodeLanguage === EvalTemplateSourceCodeLanguageEnum.PYTHON
      ? "Python"
      : "TypeScript";
  const shouldShowFormatButton = editable;
  const canFormat =
    editable && validationResult !== null && !validationResult.hasErrors;
  const formatDisabledReason =
    validationResult === null
      ? "Wait for code validation to finish before formatting."
      : validationResult.hasErrors
        ? "Fix the code validation errors before formatting."
        : null;
  // `onSourceCodeChange` comes from a react-hook-form render prop and changes
  // identity as the field updates. Keep CodeMirror's handler stable so it does
  // not reconfigure the editor on every keystroke. The refs are synced in an
  // effect (not during render) so interrupted concurrent renders never leak.
  const onSourceCodeChangeRef = useRef(onSourceCodeChange);
  const sourceCodeRef = useRef(sourceCode);
  useEffect(() => {
    onSourceCodeChangeRef.current = onSourceCodeChange;
    sourceCodeRef.current = sourceCode;
  });
  const handleSourceCodeChange = useCallback((value: string) => {
    sourceCodeRef.current = value;
    onSourceCodeChangeRef.current(value);
  }, []);

  const diagnostics = useMemo(
    () =>
      (validationResult?.diagnostics ?? []).map((diagnostic): Diagnostic => {
        const from = Math.min(diagnostic.from, sourceCode.length);
        return {
          from,
          to: Math.min(Math.max(from + 1, diagnostic.to), sourceCode.length),
          severity: diagnostic.severity,
          message: diagnostic.message,
        };
      }),
    [sourceCode.length, validationResult?.diagnostics],
  );
  const editorViewRef = useRef<EditorView | null>(null);
  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      editorViewRef.current = view;
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    [diagnostics],
  );
  useEffect(() => {
    const view = editorViewRef.current;
    if (view) view.dispatch(setDiagnostics(view.state, diagnostics));
  }, [diagnostics]);

  // Reentrancy lives in a ref so `formatSource` (and with it the keydown
  // extension and the whole extension array) keeps its identity across the
  // spinner state toggles; `isFormatting` state only drives the button UI.
  const isFormattingRef = useRef(false);
  const formatSource = useCallback(async () => {
    if (!canFormat || isFormattingRef.current) return;

    isFormattingRef.current = true;
    setIsFormatting(true);
    try {
      const formatted =
        sourceCodeLanguage === EvalTemplateSourceCodeLanguageEnum.PYTHON
          ? await formatPythonCodeEvalSourceWithRuff(sourceCodeRef.current)
          : await formatTypeScriptSource(sourceCodeRef.current);
      // Prettier and Ruff always emit a trailing newline, which CodeMirror
      // would render as an empty final line.
      handleSourceCodeChange(formatted.trimEnd());
    } catch (error) {
      showErrorToast(
        "Formatting failed",
        error instanceof Error
          ? error.message
          : "The formatter could not process this code.",
      );
    } finally {
      isFormattingRef.current = false;
      setIsFormatting(false);
    }
  }, [canFormat, handleSourceCodeChange, sourceCodeLanguage]);

  const formatShortcutExtension = useMemo(
    () =>
      Prec.highest(
        EditorView.domEventHandlers({
          keydown: (event) => {
            // CodeMirror keymaps intentionally don't bind macOS Option combos
            // that type special characters, so match the physical F key here.
            if (
              event.code === "KeyF" &&
              event.shiftKey &&
              event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              formatSource();
              return true;
            }

            return false;
          },
        }),
      ),
    [formatSource],
  );
  const languageExtension = useMemo(
    () =>
      sourceCodeLanguage === EvalTemplateSourceCodeLanguageEnum.PYTHON
        ? python()
        : javascript({ typescript: true }),
    [sourceCodeLanguage],
  );
  const codeEvalHoverExtension = useMemo(
    () =>
      createCodeEvalHoverExtension({
        hoverDocs: getCodeEvalHoverDocs(sourceCodeLanguage),
        ctxSample,
        languageExtension,
        codeMirrorTheme,
      }),
    [codeMirrorTheme, ctxSample, languageExtension, sourceCodeLanguage],
  );
  const codeEvalCompletionExtension = useMemo(
    () => getCodeEvalCompletionExtension(sourceCodeLanguage),
    [sourceCodeLanguage],
  );
  const extensions = useMemo(
    () => [
      // The `editable` prop only blocks direct typing; readOnly also blocks
      // paste and drag-and-drop edits.
      ...(!editable ? [EditorState.readOnly.of(true)] : []),
      languageExtension,
      codeEvalCompletionExtension,
      ctxHoverAffordanceExtension,
      codeEvalHoverExtension,
      ...(editable
        ? [formatShortcutExtension, autoScrollOnSelectionDrag()]
        : []),
      EditorView.lineWrapping,
      codeMirrorLayoutTheme,
      codeMirrorSearchPanel,
    ],
    [
      codeEvalCompletionExtension,
      codeEvalHoverExtension,
      editable,
      formatShortcutExtension,
      languageExtension,
    ],
  );
  const formatButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isFormatting || !canFormat}
      aria-keyshortcuts={FORMAT_SHORTCUT_ARIA}
      className={formatDisabledReason ? "pointer-events-none" : undefined}
      onClick={() => formatSource()}
    >
      {isFormatting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
      Format
      <span className="ml-2 hidden md:inline-flex">
        <KeyboardShortcut size="sm" keys={["Shift", "Alt", "F"]} />
      </span>
    </Button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-sm">{languageLabel}</span>
          {headerAction}
        </div>
        {shouldShowFormatButton ? (
          formatDisabledReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed">
                  {formatButton}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDisabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            formatButton
          )
        ) : null}
      </div>
      <CodeMirror
        value={sourceCode}
        theme={codeMirrorTheme}
        basicSetup={CODE_MIRROR_BASIC_SETUP}
        extensions={extensions}
        editable={editable}
        onChange={handleSourceCodeChange}
        onCreateEditor={handleCreateEditor}
        className="ph-no-capture overflow-hidden rounded-md border text-xs"
      />
      <p className="text-muted-foreground text-xs">
        Hover over <code className="font-mono">ctx</code> to preview its type
        and selected sample data.{" "}
        <a
          href={FUNCTION_CONTRACT_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          See full type definitions.
        </a>
      </p>
    </div>
  );
}
