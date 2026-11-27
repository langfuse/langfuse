import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
  deepParseJsonIterative,
} from "@langfuse/shared";
import { serializeCodeEvalSnippetValue } from "@/src/features/evals/v2/fns/evaluatorTesting/serializeCodeEvalSnippetValue";

/** Formats the concrete value passed to evaluate() for the selected sample. */
export function buildCodeEvalContextSnippet(
  sampleObservation: Record<string, unknown>,
  language: EvalTemplateSourceCodeLanguage,
) {
  const observation = {
    input: deepParseJsonIterative(sampleObservation.input),
    output: deepParseJsonIterative(sampleObservation.output),
    metadata: deepParseJsonIterative(sampleObservation.metadata),
    // Tool calls are already normalized by extraction. Deep-parsing them can
    // corrupt string-valued identifiers such as a tool named "true".
    toolCalls: Array.isArray(sampleObservation.toolCalls)
      ? sampleObservation.toolCalls
      : [],
  };
  const hasExperimentContext =
    "experimentItemExpectedOutput" in sampleObservation ||
    "experimentItemMetadata" in sampleObservation;
  const experiment = hasExperimentContext
    ? {
        itemExpectedOutput: deepParseJsonIterative(
          sampleObservation.experimentItemExpectedOutput ?? null,
        ),
        itemMetadata: deepParseJsonIterative(
          sampleObservation.experimentItemMetadata ?? null,
        ),
      }
    : undefined;

  if (language === EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT) {
    const payload = { observation, ...(experiment ? { experiment } : {}) };
    return `const ctx = ${serializeCodeEvalSnippetValue(payload, language, "")};`;
  }

  const fields = [
    ["input", observation.input],
    ["output", observation.output],
    ["metadata", observation.metadata],
    ["tool_calls", observation.toolCalls],
  ] as const;
  const observationFields = fields
    .map(
      ([key, value]) =>
        `    ${key}=${serializeCodeEvalSnippetValue(value, language, "    ")},`,
    )
    .join("\n");
  const experimentSnippet = experiment
    ? `,\n  experiment=ExperimentContext(\n    item_expected_output=${serializeCodeEvalSnippetValue(experiment.itemExpectedOutput, language, "    ")},\n    item_metadata=${serializeCodeEvalSnippetValue(experiment.itemMetadata, language, "    ")},\n  )`
    : "";
  return `ctx = EvaluationContext(\n  observation=ObservationContext(\n${observationFields}\n  )${experimentSnippet},\n)`;
}
