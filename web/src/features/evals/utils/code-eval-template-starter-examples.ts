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
        itemExpectedOutput: any;
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
type ScoreBase = {
  /**
   * The score name.
   */
  name: string;
  /**
   * The reasoning or explanation stored with the score.
   */
  comment?: string;
  /**
   * The score config id to attach to the score.
   */
  configId?: string | null;
  /**
   * Extra metadata stored with the score.
   */
  metadata?: Record<string, unknown>;
};

type NumericScore = ScoreBase & {
  /**
   * The Langfuse score data type.
   */
  dataType: "NUMERIC";
  /**
   * The score value.
   */
  value: number;
};

type BooleanScore = ScoreBase & {
  /**
   * The Langfuse score data type.
   */
  dataType: "BOOLEAN";
  /**
   * The score value.
   */
  value: boolean;
};

type CategoricalScore = ScoreBase & {
  /**
   * The Langfuse score data type.
   */
  dataType: "CATEGORICAL";
  /**
   * The score value.
   */
  value: string;
};

type TextScore = ScoreBase & {
  /**
   * The Langfuse score data type.
   */
  dataType: "TEXT";
  /**
   * The score value.
   */
  value: string;
};

type Score = NumericScore | BooleanScore | CategoricalScore | TextScore;

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
function evaluate({
  observation,
  experiment,
}: EvaluationContext): EvaluationResult {
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
    item_expected_output: Any
    item_metadata: Any


class Score(TypedDict):
    name: str
    dataType: str
    value: int | float | str | bool
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
