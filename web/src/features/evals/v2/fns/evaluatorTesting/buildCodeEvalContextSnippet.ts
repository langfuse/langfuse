import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
  deepParseJsonIterative,
} from "@langfuse/shared";

// The preview teaches shape, not full content: long strings and arrays are
// clipped so a huge sample cannot bury the structure.
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_ITEMS = 20;
const IDENTIFIER_REGEX = /^[A-Za-z_$][\w$]*$/;

function truncate(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value;
}

function serializeValue(
  value: unknown,
  language: EvalTemplateSourceCodeLanguage,
  indent: string,
): string {
  if (value === null || value === undefined) {
    return language === EvalTemplateSourceCodeLanguageEnum.PYTHON
      ? "None"
      : String(value);
  }
  if (typeof value === "string") return JSON.stringify(truncate(value));
  if (typeof value === "boolean") {
    return language === EvalTemplateSourceCodeLanguageEnum.PYTHON
      ? value
        ? "True"
        : "False"
      : String(value);
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childIndent = `${indent}  `;
    const lines = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(
        (item) =>
          `${childIndent}${serializeValue(item, language, childIndent)},`,
      );
    if (value.length > MAX_ARRAY_ITEMS) {
      const comment =
        language === EvalTemplateSourceCodeLanguageEnum.PYTHON ? "#" : "//";
      lines.push(
        `${childIndent}${comment} … ${value.length - MAX_ARRAY_ITEMS} more items`,
      );
    }
    return `[\n${lines.join("\n")}\n${indent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const childIndent = `${indent}  `;
    const lines = entries.map(([key, entry]) => {
      const keyLiteral =
        language === EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT &&
        IDENTIFIER_REGEX.test(key)
          ? key
          : JSON.stringify(key);
      return `${childIndent}${keyLiteral}: ${serializeValue(entry, language, childIndent)},`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return JSON.stringify(String(value));
}

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
    return `const ctx = ${serializeValue(payload, language, "")};`;
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
        `    ${key}=${serializeValue(value, language, "    ")},`,
    )
    .join("\n");
  const experimentSnippet = experiment
    ? `,\n  experiment=ExperimentContext(\n    item_expected_output=${serializeValue(experiment.itemExpectedOutput, language, "    ")},\n    item_metadata=${serializeValue(experiment.itemMetadata, language, "    ")},\n  )`
    : "";
  return `ctx = EvaluationContext(\n  observation=ObservationContext(\n${observationFields}\n  )${experimentSnippet},\n)`;
}
