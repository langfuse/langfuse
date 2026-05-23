import CodeMirror, {
  EditorView,
  ExternalChange,
  hoverTooltip,
  keymap,
} from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { StreamLanguage, type StringStream } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { darkTheme } from "@/src/components/editor/dark-theme";
import { lightTheme } from "@/src/components/editor/light-theme";
import {
  TYPESCRIPT_CODE_EVAL_CONTRACT,
  type CodeEvalSourceCodeLanguage,
  type CodeEvalValidationResult,
  formatPythonCodeEvalSourceWithRuff,
  validateCodeEvalSourceWithLanguage,
} from "@/src/features/evals/utils/code-eval-template-validation";

type CodeEvalTemplateFormBodyProps = {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
  onSourceCodeChange: (value: string) => void;
  editable: boolean;
  validationResult: CodeEvalValidationResult | null;
  onValidationResultChange: (result: CodeEvalValidationResult | null) => void;
  onValidationPendingChange: (isPending: boolean) => void;
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
  /(?:^|\n)def evaluate\s*\(\s*context\s*:\s*EvaluationContext\s*\)\s*->\s*EvaluationResult\s*:/;

const typescriptCodeEvalLanguage = StreamLanguage.define({
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

const scoreTypeDoc = `type Score =
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT";
  value: number | string | boolean;
  name?: string;
  comment?: string;
}

A Langfuse score returned by a code evaluator. The contract is shown at the top of the editor and is locked.`;

const hoverDocs: Record<string, string> = {
  evaluate: `TypeScript: function evaluate(context: EvaluationContext): EvaluationResult | Promise<EvaluationResult>
Python: def evaluate(context: EvaluationContext) -> EvaluationResult

The function Langfuse executes for each matched target observation.`,
  context: `parameter context

Python context passed to evaluate. The default template models it as a TypedDict with observation and optional experiment data.`,
  ctx: `parameter ctx

Older Python examples may use ctx. New Python templates use context: EvaluationContext.`,
  EvaluationContext: `type EvaluationContext = {
  observation: {
    input: any;
    output: any;
    metadata: any;
  };
  experiment:
    | {
        expectedOutput: any;
        itemMetadata: any;
      }
    | undefined;
}

The data Langfuse passes to a code evaluator. The TypeScript definition is locked at the top of the editor.`,
  observation: `property EvaluationContext.observation: {
  input: unknown;
  output: unknown;
  metadata: unknown;
}

The observation selected by the evaluator target.`,
  experiment: `property EvaluationContext.experiment?: {
  expectedOutput: unknown;
  itemMetadata: unknown;
}

Dataset run item data. Present when the evaluator runs on an experiment.`,
  input: `property observation.input: any

The input recorded on the observation.`,
  output: `property observation.output: any

The output recorded on the observation.`,
  metadata: `property observation.metadata: any

The metadata recorded on the observation.`,
  expectedOutput: `property experiment.expectedOutput: any

The expected output from the dataset item.`,
  itemMetadata: `property experiment.itemMetadata: any

The metadata from the dataset item.`,
  Any: `typing.Any

Use for JSON-like evaluator values whose concrete type depends on the target observation.`,
  TypedDict: `typing.TypedDict

Use to describe the dictionary-shaped Python evaluator context and result.`,
  NotRequired: `typing.NotRequired

Use for optional keys in Python TypedDict definitions.`,
  expected_output: `key experiment["expected_output"]

The expected output from the dataset item in Python.`,
  item_metadata: `key experiment["item_metadata"]

The metadata from the dataset item in Python.`,
  EvaluationResult: `type EvaluationResult = {
  scores: Score[];
}

The value returned by evaluate.`,
  Score: scoreTypeDoc,
  scores: `property EvaluationResult.scores: Score[];

One or more Langfuse scores to create for the target observation.`,
  dataType: `property Score.dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT"

The Langfuse score data type.`,
  value: `property Score.value: number | string | boolean

The score value. The allowed value depends on dataType: NUMERIC uses number, BOOLEAN uses boolean, 0/1, or true/false-like strings, and CATEGORICAL or TEXT use string.`,
  name: `property Score.name?: string

The score name. When omitted, Langfuse uses the evaluator's configured score name.`,
  comment: `property Score.comment?: string | null

The reasoning or explanation stored with the score.`,
  configId: `property Score.configId?: string | null

The score config id to attach to the score.`,
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
        "max-w-xl whitespace-pre-wrap rounded-md border bg-popover px-3 py-2 font-mono text-xs text-popover-foreground shadow-md";
      dom.textContent = hoverDocs[word];
      return { dom };
    },
  };
});

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
  const formattedSource = await formatPythonCodeEvalSourceWithRuff(source);
  const ranges = findPythonContractRanges(source);
  const formattedRanges = findPythonContractRanges(formattedSource);

  if (!ranges || !formattedRanges) return formattedSource;

  return `${source.slice(0, ranges.signature.to)}${formattedSource.slice(
    formattedRanges.signature.to,
  )}`;
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

export function CodeEvalTemplateFormBody({
  sourceCode,
  sourceCodeLanguage,
  onSourceCodeChange,
  editable,
  validationResult,
  onValidationResultChange,
  onValidationPendingChange,
}: CodeEvalTemplateFormBodyProps) {
  const { resolvedTheme } = useTheme();
  const codeMirrorViewRef = useRef<EditorView | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const codeMirrorTheme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  const languageLabel =
    sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
      ? "Python"
      : "TypeScript";

  const handleCreateEditor = useCallback((view: EditorView) => {
    codeMirrorViewRef.current = view;
    scrollCodeMirrorToBottom(view);
  }, []);

  useEffect(() => {
    const view = codeMirrorViewRef.current;
    if (!view) return;

    scrollCodeMirrorToBottom(view);
  }, [sourceCode, sourceCodeLanguage]);

  useEffect(() => {
    let isActive = true;
    onValidationPendingChange(true);

    const timeout = setTimeout(() => {
      validateCodeEvalSourceWithLanguage({
        source: sourceCode,
        sourceCodeLanguage,
      })
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
                    : `Failed to validate ${languageLabel} source.`,
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
  }, [
    languageLabel,
    onValidationPendingChange,
    onValidationResultChange,
    sourceCode,
    sourceCodeLanguage,
  ]);

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
  const languageExtension = useMemo(
    () =>
      sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
        ? python()
        : typescriptCodeEvalLanguage,
    [sourceCodeLanguage],
  );
  const protectedContractExtensions = useMemo(
    () => contractReadOnlyExtensions,
    [],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">{languageLabel}</span>
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
          languageExtension,
          ...protectedContractExtensions,
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
        onCreateEditor={handleCreateEditor}
        onChange={onSourceCodeChange}
        className="overflow-hidden rounded-md border text-xs"
      />
    </div>
  );
}
