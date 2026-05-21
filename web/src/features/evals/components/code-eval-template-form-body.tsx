import CodeMirror, {
  EditorView,
  hoverTooltip,
  keymap,
} from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { StreamLanguage, type StringStream } from "@codemirror/language";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import {
  type CodeEvalValidationResult,
  validateCodeEvalSourceWithTypescript,
} from "@/src/features/evals/utils/code-eval-template-validation";

type CodeEvalTemplateFormBodyProps = {
  sourceCode: string;
  onSourceCodeChange: (value: string) => void;
  editable: boolean;
  validationResult: CodeEvalValidationResult | null;
  onValidationResultChange: (result: CodeEvalValidationResult | null) => void;
  onValidationPendingChange: (isPending: boolean) => void;
};

const codeEvalLanguage = StreamLanguage.define({
  name: "typescript-code-eval",
  token: (stream: StringStream) => {
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    if (stream.match("/*")) {
      while (!stream.eol()) {
        if (stream.match("*/")) break;
        stream.next();
      }
      return "comment";
    }

    if (stream.match(/["'`]/, false)) {
      const quote = stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const next = stream.next();
        if (next === quote && !escaped) break;
        escaped = next === "\\" && !escaped;
      }
      return "string";
    }

    if (
      stream.match(
        /\b(?:async|await|const|let|return|export|function|type|interface|if|else|true|false|undefined|null)\b/,
      )
    ) {
      return "keyword";
    }

    if (
      stream.match(
        /\b(?:EvaluationContext|EvaluationResult|Score|Promise|Record|unknown|string|number|boolean)\b/,
      )
    ) {
      return "typeName";
    }

    if (stream.match(/\b\d+(?:\.\d+)?\b/)) {
      return "number";
    }

    stream.next();
    return null;
  },
});

const hoverDocs: Record<string, string> = {
  evaluate:
    "The exported function Langfuse executes. It must accept EvaluationContext-compatible input and return EvaluationResult or Promise<EvaluationResult>.",
  EvaluationContext:
    "Context passed to the evaluator: { observation, experiment? }.",
  observation:
    "Observation data for the matched target. Includes input, output, and metadata.",
  experiment:
    "Experiment data when the evaluator runs on experiments. Undefined for non-experiment targets.",
  input: "Observation input.",
  output: "Observation output.",
  metadata: "Observation metadata.",
  expectedOutput: "Expected output from the experiment item.",
  itemMetadata: "Metadata from the experiment item.",
  EvaluationResult: "Return shape for code evaluators: { scores: Score[] }.",
  Score:
    "A score emitted by the evaluator. Include value and optionally name, dataType, comment, configId, and metadata.",
  scores: "One or more scores to create for the target observation.",
  dataType:
    'Score type: "NUMERIC", "BOOLEAN", "CATEGORICAL", or "TEXT". Omit to let Langfuse infer numeric or categorical values.',
  value: "Score value.",
  comment: "Human-readable explanation stored on the score.",
  configId: "Optional score config id.",
};

const codeEvalHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;
  const before = text.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0];
  const after = text.slice(offset).match(/^[A-Za-z0-9_]*/)?.[0] ?? "";
  const word = `${before ?? ""}${after}`;
  if (!word || !hoverDocs[word]) return null;

  const from = pos - (before?.length ?? 0);
  const to = from + word.length;

  return {
    pos: from,
    end: to,
    create() {
      const dom = document.createElement("div");
      dom.className =
        "rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md";
      dom.textContent = hoverDocs[word];
      return { dom };
    },
  };
});

export function CodeEvalTemplateFormBody({
  sourceCode,
  onSourceCodeChange,
  editable,
  validationResult,
  onValidationResultChange,
  onValidationPendingChange,
}: CodeEvalTemplateFormBodyProps) {
  const { resolvedTheme } = useTheme();
  const [isFormatting, setIsFormatting] = useState(false);
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  useEffect(() => {
    let isActive = true;
    onValidationPendingChange(true);

    const timeout = setTimeout(() => {
      validateCodeEvalSourceWithTypescript(sourceCode)
        .then((result) => {
          if (!isActive) return;
          onValidationResultChange(result);
        })
        .catch((error) => {
          if (!isActive) return;
          onValidationResultChange({
            sourceBytes: new TextEncoder().encode(sourceCode).length,
            hasErrors: true,
            diagnostics: [
              {
                from: 0,
                to: Math.max(1, sourceCode.length),
                severity: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Failed to validate TypeScript source.",
              },
            ],
          });
        })
        .finally(() => {
          if (isActive) onValidationPendingChange(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [onValidationPendingChange, onValidationResultChange, sourceCode]);

  const diagnostics = useMemo(
    () => validationResult?.diagnostics ?? [],
    [validationResult?.diagnostics],
  );

  const formatSource = useCallback(async () => {
    if (!editable || isFormatting) return;

    setIsFormatting(true);
    try {
      const [{ format }, typescriptPlugin, estreePlugin] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/typescript"),
        import("prettier/plugins/estree"),
      ]);
      const formatted = await format(sourceCode, {
        parser: "typescript",
        plugins: [typescriptPlugin, estreePlugin],
      });
      onSourceCodeChange(formatted);
    } catch (error) {
      console.error(error);
    } finally {
      setIsFormatting(false);
    }
  }, [editable, isFormatting, onSourceCodeChange, sourceCode]);

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
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            void formatSource();
            return true;
          },
        },
      ]),
    [formatSource],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">TypeScript</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editable || isFormatting}
          aria-keyshortcuts="Meta+S Control+S"
          onClick={() => void formatSource()}
        >
          {isFormatting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Format
          <kbd className="bg-muted text-muted-foreground pointer-events-none ml-2 hidden h-4 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium select-none sm:inline-flex">
            <span className="text-xs">⌘</span>S
          </kbd>
        </Button>
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
          codeEvalLanguage,
          codeEvalHover,
          linterExtension,
          formatShortcutExtension,
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
        onChange={onSourceCodeChange}
        className="overflow-hidden rounded-md border text-xs"
      />
    </div>
  );
}
