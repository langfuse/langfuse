export const DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE = `/**
 * Evaluates one observation and returns one or more Langfuse scores.
 */
export async function evaluate({
  observation,
  experiment,
}: EvaluationContext): Promise<EvaluationResult> {
  const expectedOutput = experiment?.expectedOutput;
  const matchesExpectedOutput =
    expectedOutput !== undefined && observation.output === expectedOutput;

  return {
    scores: [
      {
        name: "Exact match",
        value: matchesExpectedOutput,
        dataType: "BOOLEAN",
        comment: matchesExpectedOutput
          ? "Output exactly matches the expected output."
          : "Output does not match the expected output.",
      },
    ],
  };
}
`;

const VALID_JSON_SOURCE = `/**
 * Checks whether the observation output is valid JSON.
 */
export async function evaluate({
  observation,
}: EvaluationContext): Promise<EvaluationResult> {
  const isValidJson = canReadAsJson(observation.output);

  return {
    scores: [
      {
        name: "Valid JSON",
        value: isValidJson,
        dataType: "BOOLEAN",
        comment: isValidJson
          ? "Output is valid JSON."
          : "Output is not valid JSON.",
      },
    ],
  };
}

function canReadAsJson(value: unknown): boolean {
  if (typeof value !== "string") {
    return value !== undefined;
  }

  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
`;

const JSON_CONTAINS_SOURCE = `/**
 * Checks whether the observation output contains an expected JSON key/value pair.
 */
export async function evaluate({
  observation,
}: EvaluationContext): Promise<EvaluationResult> {
  const requiredKey = "status";
  const requiredValue = "ok";
  const output = parseJsonObject(observation.output);
  const containsExpectedValue =
    output !== null && output[requiredKey] === requiredValue;

  return {
    scores: [
      {
        name: "JSON contains",
        value: containsExpectedValue,
        dataType: "BOOLEAN",
        comment: containsExpectedValue
          ? "Output contains the expected JSON value."
          : "Output does not contain the expected JSON value.",
      },
    ],
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  const parsed = typeof value === "string" ? parseJson(value) : value;

  if (parsed === null || typeof parsed !== "object") {
    return null;
  }

  return parsed as Record<string, unknown>;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
`;

export type CodeEvalTemplateStarterExample = {
  id: string;
  title: string;
  description: string;
  templateName: string;
  sourceCode: string;
};

export const CODE_EVAL_TEMPLATE_STARTER_EXAMPLES: CodeEvalTemplateStarterExample[] =
  [
    {
      id: "exact-match",
      title: "Exact match",
      description: "Compare the output with the expected output.",
      templateName: "Exact match",
      sourceCode: DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
    },
    {
      id: "valid-json",
      title: "Valid JSON",
      description: "Pass when the output can be read as JSON.",
      templateName: "Valid JSON",
      sourceCode: VALID_JSON_SOURCE,
    },
    {
      id: "json-contains",
      title: "JSON contains",
      description: "Check for a required key/value pair in JSON output.",
      templateName: "JSON contains",
      sourceCode: JSON_CONTAINS_SOURCE,
    },
  ];
