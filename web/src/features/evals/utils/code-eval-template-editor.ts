import { type Diagnostic } from "@codemirror/lint";

import { type CodeEvalDiagnostic } from "@/src/features/evals/utils/code-eval-template-validation";

export function mapCodeEvalDiagnosticsToCodeMirror(
  diagnostics: readonly CodeEvalDiagnostic[],
): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    from: diagnostic.from,
    to: Math.max(diagnostic.from + 1, diagnostic.to),
    severity: diagnostic.severity,
    message: diagnostic.message,
  }));
}

/**
 * CodeMirror's MutationObserver can echo the current document back through
 * `onChange` while React is already committing the same value. Pushing that
 * echo into react-hook-form nests setState until React 185.
 */
export function commitCodeEvalSourceChange(
  nextValue: string,
  currentValueRef: { current: string },
  onChange: (value: string) => void,
): boolean {
  if (nextValue === currentValueRef.current) {
    return false;
  }

  currentValueRef.current = nextValue;
  onChange(nextValue);
  return true;
}
