import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";

export const TYPESCRIPT_CODE_EVAL_CONTRACT = `/**
 * The data Langfuse passes to a code evaluator.
 */
type EvaluationContext = {
  /**
   * The observation selected by the evaluator target.
   */
  observation: {
    /**
     * The input recorded on the observation.
     */
    input: any;
    /**
     * The output recorded on the observation.
     */
    output: any;
    /**
     * The metadata recorded on the observation.
     */
    metadata: any;
  };
  /**
   * Dataset run item data. Present when the evaluator runs on an experiment.
   */
  experiment:
    | {
        /**
         * The expected output from the dataset item.
         */
        expectedOutput: any;
        /**
         * The metadata from the dataset item.
         */
        itemMetadata: any;
      }
    | undefined;
};

/**
 * A Langfuse score returned by a code evaluator.
 */
type Score = {
  /**
   * The score name. When omitted, Langfuse uses the evaluator's configured score name.
   */
  name?: string;
  /**
   * The reasoning or explanation stored with the score.
   */
  comment?: string;
  /**
   * The Langfuse score data type.
   */
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT";
  /**
   * The score value.
   */
  value: number | string | boolean;
};

/**
 * The value returned by evaluate.
 */
type EvaluationResult = {
  /**
   * One or more Langfuse scores to create for the target observation.
   */
  scores: Score[];
};
`;

export const DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE = `${TYPESCRIPT_CODE_EVAL_CONTRACT}

/**
 * Evaluates one observation and returns one or more Langfuse scores.
 */
export async function evaluate({
  observation,
  experiment,
}: EvaluationContext): Promise<EvaluationResult> {
  const input = observation.input;
  const matchesOutput =
    input !== undefined && observation.output === input;

  return {
    scores: [
      {
        name: "Exact match",
        value: matchesOutput,
        dataType: "BOOLEAN",
        comment: matchesOutput
          ? "Output exactly matches the input."
          : "Output does not match the input.",
      },
    ],
  };
}
`;

// Add default python code eval template starter example
export const DEFAULT_PYTHON_CODE_EVAL_SOURCE = `from typing import Any, NotRequired, TypedDict


class Observation(TypedDict):
    input: Any
    output: Any
    metadata: Any


class Experiment(TypedDict):
    expected_output: Any
    item_metadata: Any


class Score(TypedDict):
    value: int | float | str | bool
    name: NotRequired[str]
    dataType: NotRequired[str]
    comment: NotRequired[str | None]
    configId: NotRequired[str | None]
    metadata: NotRequired[dict[str, Any]]


class EvaluationContext(TypedDict):
    observation: Observation
    experiment: NotRequired[Experiment | None]


class EvaluationResult(TypedDict):
    scores: list[Score]


def evaluate(context: EvaluationContext) -> EvaluationResult:
    """Evaluates one observation and returns one or more Langfuse scores."""
    experiment = context.get("experiment")
    input = context["observation"]["input"]
    matches_output = input is not None and context["observation"]["output"] == input

    return {
        "scores": [
            {
                "name": "Exact match",
                "value": matches_output,
                "dataType": "BOOLEAN",
                "comment": (
                    "Output exactly matches the input."
                    if matches_output
                    else "Output does not match the input."
                ),
            }
        ]
    }
`;

export type CodeEvalSourceCodeLanguage =
  | typeof EvalTemplateSourceCodeLanguage.PYTHON
  | typeof EvalTemplateSourceCodeLanguage.TYPESCRIPT;

export function getDefaultCodeEvalSource(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
) {
  return sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
    ? DEFAULT_PYTHON_CODE_EVAL_SOURCE
    : DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE;
}

export function isDefaultCodeEvalSource(sourceCode: string) {
  return (
    sourceCode === DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE ||
    sourceCode === DEFAULT_PYTHON_CODE_EVAL_SOURCE
  );
}
