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

// Add default python code eval template starter example
