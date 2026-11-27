import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";
import { serializeCodeEvalSnippetValue } from "@/src/features/evals/v2/fns/evaluatorTesting/serializeCodeEvalSnippetValue";

/** Formats the trace context passed to evaluate() for the selected sample. */
export function buildTraceCodeEvalContextSnippet(
  threads: unknown,
  language: EvalTemplateSourceCodeLanguage,
) {
  if (language === EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT) {
    const payload = { targetType: "trace", trace: { threads } };
    return `const ctx = ${serializeCodeEvalSnippetValue(payload, language, "")};`;
  }

  return `ctx = EvaluationContext(\n  target_type="trace",\n  trace=TraceContext(\n    threads=${serializeCodeEvalSnippetValue(threads, language, "    ")},\n  ),\n)`;
}
