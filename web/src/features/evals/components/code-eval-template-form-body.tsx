import CodeMirror, { EditorView, hoverTooltip } from "@uiw/react-codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
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
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import { autoScrollOnSelectionDrag } from "@/src/components/editor/autoScrollOnSelectionDrag";
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

function createCodeEvalHoverExtension(hoverDocs: CodeEvalHoverDocs) {
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
          "max-w-xl whitespace-pre-wrap rounded-md border bg-popover px-3 py-2 font-mono text-xs text-popover-foreground shadow-md";
        dom.textContent = hoverDoc;
        return { dom };
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
  headerAction,
}: CodeEvalTemplateFormBodyProps) {
  const { resolvedTheme } = useTheme();
  const [isFormatting, setIsFormatting] = useState(false);
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  const languageLabel =
    sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
      ? "Python"
      : "TypeScript";
  const shouldShowFormatButton = editable;
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
    () => validationResult?.diagnostics ?? [],
    [validationResult?.diagnostics],
  );

  // Reentrancy lives in a ref so `formatSource` (and with it the keydown
  // extension and the whole extension array) keeps its identity across the
  // spinner state toggles; `isFormatting` state only drives the button UI.
  const isFormattingRef = useRef(false);
  const formatSource = useCallback(async () => {
    if (!editable || isFormattingRef.current) return;

    isFormattingRef.current = true;
    setIsFormatting(true);
    try {
      const formatted =
        sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
          ? await formatPythonCodeEvalSourceWithRuff(sourceCodeRef.current)
          : await formatTypeScriptSource(sourceCodeRef.current);
      // Prettier and Ruff always emit a trailing newline, which CodeMirror
      // would render as an empty final line.
      handleSourceCodeChange(formatted.trimEnd());
    } catch (error) {
      console.error(error);
    } finally {
      isFormattingRef.current = false;
      setIsFormatting(false);
    }
  }, [editable, handleSourceCodeChange, sourceCodeLanguage]);

  const linterExtension = useMemo(
    () =>
      linter(() =>
        diagnostics.map(
          (diagnostic): Diagnostic => ({
            from: diagnostic.from,
            to: Math.max(diagnostic.from + 1, diagnostic.to),
            severity: diagnostic.severity,
            message: diagnostic.message,
          }),
        ),
      ),
    [diagnostics],
  );
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
      sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
        ? python()
        : javascript({ typescript: true }),
    [sourceCodeLanguage],
  );
  const codeEvalHoverExtension = useMemo(
    () =>
      createCodeEvalHoverExtension(getCodeEvalHoverDocs(sourceCodeLanguage)),
    [sourceCodeLanguage],
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
      codeEvalHoverExtension,
      linterExtension,
      ...(editable
        ? [formatShortcutExtension, autoScrollOnSelectionDrag()]
        : []),
      EditorView.lineWrapping,
      codeMirrorLayoutTheme,
    ],
    [
      codeEvalCompletionExtension,
      codeEvalHoverExtension,
      editable,
      formatShortcutExtension,
      languageExtension,
      linterExtension,
    ],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-sm">{languageLabel}</span>
          {headerAction}
        </div>
        {shouldShowFormatButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFormatting}
            aria-keyshortcuts={FORMAT_SHORTCUT_ARIA}
            onClick={() => formatSource()}
          >
            {isFormatting && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Format
            <KeyboardShortcut
              className="ml-2 hidden h-4 sm:inline-flex"
              keys={
                typeof navigator !== "undefined" &&
                navigator.userAgent.includes("Macintosh")
                  ? ["⇧", "⌥", "F"]
                  : ["Shift", "Alt", "F"]
              }
            />
          </Button>
        ) : null}
      </div>
      <CodeMirror
        value={sourceCode}
        theme={codeMirrorTheme}
        basicSetup={CODE_MIRROR_BASIC_SETUP}
        extensions={extensions}
        editable={editable}
        onChange={handleSourceCodeChange}
        className="overflow-hidden rounded-md border text-xs"
      />
      <p className="text-muted-foreground text-xs">
        The evaluate function receives an EvaluationContext and returns an
        EvaluationResult with one or more scores.{" "}
        <a
          href={FUNCTION_CONTRACT_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          See type definitions.
        </a>
      </p>
    </div>
  );
}
