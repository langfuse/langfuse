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
   * Experiment item data. Present when the evaluator runs on an experiment.
   */
  experiment:
    | {
        /**
         * The expected output from the experiment item.
         */
        itemExpectedOutput: any;
        /**
         * The metadata from the experiment item.
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
export function evaluate(ctx: EvaluationContext): EvaluationResult {
  const input = ctx.observation.input;
  const matchesOutput =
    input !== undefined && ctx.observation.output === input;

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

export const PYTHON_CODE_EVAL_CONTRACT = `from typing import Any, NotRequired, TypedDict


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
`;

export const DEFAULT_PYTHON_CODE_EVAL_SOURCE = `${PYTHON_CODE_EVAL_CONTRACT}


def evaluate(ctx: EvaluationContext) -> EvaluationResult:
    """Evaluates one observation and returns one or more Langfuse scores."""
    input = ctx["observation"]["input"]
    matches_output = input is not None and ctx["observation"]["output"] == input

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

export function getCodeEvalSourceForEditor({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode?: string | null;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}) {
  if (!sourceCode?.trim()) return getDefaultCodeEvalSource(sourceCodeLanguage);

  if (sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON) {
    return sourceCode.trimStart().startsWith(PYTHON_CODE_EVAL_CONTRACT)
      ? sourceCode
      : `${PYTHON_CODE_EVAL_CONTRACT}\n\n${sourceCode.trimStart()}`;
  }

  return sourceCode.startsWith(TYPESCRIPT_CODE_EVAL_CONTRACT)
    ? sourceCode
    : `${TYPESCRIPT_CODE_EVAL_CONTRACT}\n\n${sourceCode.trimStart()}`;
}

export function stripCodeEvalSourceForSubmit({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}) {
  if (sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON) {
    const evaluateMatch = sourceCode.match(/(?:^|\n)\s*def\s+evaluate\s*\(/);
    if (!evaluateMatch || evaluateMatch.index === undefined) {
      return sourceCode.trim();
    }

    return sourceCode.slice(evaluateMatch.index).trimStart().trimEnd();
  }

  return sourceCode.startsWith(TYPESCRIPT_CODE_EVAL_CONTRACT)
    ? sourceCode.slice(TYPESCRIPT_CODE_EVAL_CONTRACT.length).trim()
    : sourceCode.trim();
}
