import CodeMirror, {
  EditorView,
  ExternalChange,
  hoverTooltip,
} from "@uiw/react-codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { foldEffect, foldable } from "@codemirror/language";
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
import {
  getCodeEvalHoverDocs,
  type CodeEvalHoverDocs,
} from "@/src/features/evals/utils/code-eval-template-hover-docs";
import {
  formatPythonCodeEvalSourceWithRuff,
  PYTHON_CODE_EVAL_CONTRACT,
  TYPESCRIPT_CODE_EVAL_CONTRACT,
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

type ProtectedRange = {
  from: number;
  to: number;
};

type ContractRanges = {
  prelude: ProtectedRange | null;
  signature: ProtectedRange;
};

const PYTHON_EVALUATE_SIGNATURE_PATTERN =
  /(?:^|\n)def evaluate\s*\(\s*ctx\s*:\s*EvaluationContext\s*\)\s*->\s*EvaluationResult\s*:/;
const FORMAT_SHORTCUT_ARIA = "Alt+Shift+F";

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

function findPythonContractRanges(source: string): ContractRanges | null {
  const match = source.match(PYTHON_EVALUATE_SIGNATURE_PATTERN);
  if (!match || match.index === undefined) return null;

  const signatureStart = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const signatureLineEnd = source.indexOf("\n", signatureStart);
  const signatureTo =
    signatureLineEnd === -1 ? source.length : signatureLineEnd + 1;

  return {
    prelude: signatureStart > 0 ? { from: 0, to: signatureStart } : null,
    signature: { from: signatureStart, to: signatureTo },
  };
}

function findTypeScriptContractRanges(source: string): ContractRanges | null {
  if (!source.startsWith(TYPESCRIPT_CODE_EVAL_CONTRACT)) return null;

  return {
    prelude: { from: 0, to: TYPESCRIPT_CODE_EVAL_CONTRACT.length },
    signature: {
      from: TYPESCRIPT_CODE_EVAL_CONTRACT.length,
      to: TYPESCRIPT_CODE_EVAL_CONTRACT.length,
    },
  };
}

function getProtectedContractRanges(source: string): ProtectedRange[] {
  const ranges =
    findPythonContractRanges(source) ?? findTypeScriptContractRanges(source);
  if (!ranges) return [];

  return [
    ...(ranges.prelude ? [ranges.prelude] : []),
    ...(ranges.signature.from < ranges.signature.to ? [ranges.signature] : []),
  ];
}

function isChangeInProtectedRange(
  from: number,
  to: number,
  range: ProtectedRange,
) {
  if (from === to) {
    return from >= range.from && from < range.to;
  }

  return from < range.to && to > range.from;
}

const contractReadOnlyExtension = EditorState.changeFilter.of((tr) => {
  if (!tr.docChanged) return true;
  if (tr.annotation(ExternalChange)) return true;

  const protectedRanges = getProtectedContractRanges(
    tr.startState.doc.toString(),
  );
  if (protectedRanges.length === 0) return true;

  let touchesProtectedRange = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (
      protectedRanges.some((range) =>
        isChangeInProtectedRange(fromA, toA, range),
      )
    ) {
      touchesProtectedRange = true;
    }
  }, true);

  return touchesProtectedRange ? false : true;
});

const contractReadOnlyExtensions = [contractReadOnlyExtension];

async function formatTypeScriptSource(source: string) {
  const [{ format }, typescriptPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/estree"),
  ]);

  const ranges = findTypeScriptContractRanges(source);
  if (!ranges?.prelude) {
    return format(source, {
      parser: "typescript",
      plugins: [typescriptPlugin, estreePlugin],
    });
  }

  const formattedEditableSource = await format(
    source.slice(ranges.prelude.to),
    {
      parser: "typescript",
      plugins: [typescriptPlugin, estreePlugin],
    },
  );

  return `${source.slice(0, ranges.prelude.to)}\n${formattedEditableSource.trimStart()}`;
}

async function formatPythonSource(source: string) {
  const ranges = findPythonContractRanges(source);
  if (!ranges?.prelude) {
    return formatPythonCodeEvalSourceWithRuff(source);
  }

  const formattedEditableSource = await formatPythonCodeEvalSourceWithRuff(
    source.slice(ranges.prelude.to),
  );

  return `${source.slice(0, ranges.prelude.to).trimEnd()}\n\n\n${formattedEditableSource.trimStart()}`;
}

function scrollCodeMirrorToBottom(view: EditorView) {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    if (!view.dom.isConnected) return;

    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.length, { y: "end" }),
    });
  });
}

function foldContractTypes(
  view: EditorView,
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
) {
  if (typeof window === "undefined") return;

  const contractLength =
    sourceCodeLanguage === "PYTHON"
      ? PYTHON_CODE_EVAL_CONTRACT.length
      : TYPESCRIPT_CODE_EVAL_CONTRACT.length;

  const doFold = () => {
    if (!view.dom.isConnected) return;

    const effects: ReturnType<typeof foldEffect.of>[] = [];
    const state = view.state;

    // Find all foldable ranges within the contract section
    let pos = 0;
    while (pos < contractLength && pos < state.doc.length) {
      const line = state.doc.lineAt(pos);
      const range = foldable(state, line.from, line.to);
      if (range && range.from < contractLength) {
        effects.push(foldEffect.of({ from: range.from, to: range.to }));
      }
      pos = line.to + 1;
    }

    if (effects.length > 0) {
      view.dispatch({ effects });
    }
  };

  // Delay to ensure the language parser has time to analyze the document.
  // Python parsing may need more time than TypeScript.
  const delay = sourceCodeLanguage === "PYTHON" ? 100 : 50;
  setTimeout(doFold, delay);
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
  const codeMirrorViewRef = useRef<EditorView | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  const languageLabel =
    sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
      ? "Python"
      : "TypeScript";
  const shouldShowFormatButton = editable;

  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      codeMirrorViewRef.current = view;
      foldContractTypes(view, sourceCodeLanguage);
      scrollCodeMirrorToBottom(view);
    },
    [sourceCodeLanguage],
  );

  useEffect(() => {
    const view = codeMirrorViewRef.current;
    if (!view) return;

    // Don't re-fold on every sourceCode change, only on language change
    scrollCodeMirrorToBottom(view);
  }, [sourceCode]);

  useEffect(() => {
    const view = codeMirrorViewRef.current;
    if (!view) return;

    // Re-fold when language changes
    foldContractTypes(view, sourceCodeLanguage);
    scrollCodeMirrorToBottom(view);
  }, [sourceCodeLanguage]);

  const diagnostics = useMemo(
    () => validationResult?.diagnostics ?? [],
    [validationResult?.diagnostics],
  );

  const formatSource = useCallback(async () => {
    if (!editable || isFormatting) return;

    setIsFormatting(true);
    try {
      const formatted =
        sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
          ? await formatPythonSource(sourceCode)
          : await formatTypeScriptSource(sourceCode);
      onSourceCodeChange(formatted);
    } catch (error) {
      console.error(error);
    } finally {
      setIsFormatting(false);
    }
  }, [
    editable,
    isFormatting,
    onSourceCodeChange,
    sourceCode,
    sourceCodeLanguage,
  ]);

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
  const protectedContractExtensions = useMemo(
    () => contractReadOnlyExtensions,
    [],
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
        basicSetup={{
          foldGutter: true,
          highlightActiveLine: false,
          lineNumbers: true,
          searchKeymap: true,
        }}
        extensions={[
          ...(!editable ? [EditorState.readOnly.of(true)] : []),
          languageExtension,
          ...protectedContractExtensions,
          codeEvalHoverExtension,
          linterExtension,
          ...(shouldShowFormatButton ? [formatShortcutExtension] : []),
          EditorView.lineWrapping,
          EditorView.theme({
            "&.cm-focused": { outline: "none" },
            ".cm-gutters": { borderRight: "1px solid" },
            ".cm-scroller": {
              minHeight: "360px",
              maxHeight: "60dvh",
              overflow: "auto",
            },
            ".cm-content": {
              minHeight: "360px",
            },
          }),
        ]}
        editable={editable}
        onCreateEditor={handleCreateEditor}
        onChange={onSourceCodeChange}
        className="overflow-hidden rounded-md border text-xs"
      />
    </div>
  );
}
