import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";

import type { CodeEvalSourceCodeLanguage } from "@/src/features/evals/utils/code-eval-template-starter-examples";

export type CodeEvalHoverDocs = Record<string, string>;

const TYPESCRIPT_SCORE_DOC = `type Score =
  | (ScoreBase & { dataType: "NUMERIC"; value: number })
  | (ScoreBase & { dataType: "BOOLEAN"; value: boolean })
  | (ScoreBase & { dataType: "CATEGORICAL"; value: string })
  | (ScoreBase & { dataType: "TEXT"; value: string });

type ScoreBase = {
  name: string;
  comment?: string;
  configId?: string | null;
  metadata?: Record<string, unknown>;
}

A Langfuse score returned by a TypeScript evaluator. The contract is shown at the top of the editor and is locked.`;

const PYTHON_SCORE_DOC = `class Score(TypedDict):
    name: str
    dataType: str
    value: int | float | str | bool
    comment: NotRequired[str | None]
    configId: NotRequired[str | None]
    metadata: NotRequired[dict[str, Any]]

A Langfuse score returned by a Python evaluator.`;

export const TYPESCRIPT_CODE_EVAL_HOVER_DOCS = {
  evaluate: `function evaluate(context: EvaluationContext): EvaluationResult

The TypeScript function Langfuse executes for each matched target observation.`,
  context: `parameter context: EvaluationContext

The TypeScript value Langfuse passes to evaluate.`,
  EvaluationContext: `type EvaluationContext = {
  observation: {
    input: any;
    output: any;
    metadata: any;
  };
  experiment:
    | {
        itemExpectedOutput: any;
        itemMetadata: any;
      }
    | undefined;
}

The data Langfuse passes to a TypeScript evaluator. The definition is locked at the top of the editor.`,
  observation: `property EvaluationContext.observation: {
  input: any;
  output: any;
  metadata: any;
}

The observation selected by the evaluator target.`,
  experiment: `property EvaluationContext.experiment?: {
  itemExpectedOutput: any;
  itemMetadata: any;
}

Experiment item data. Present when the evaluator runs on an experiment.`,
  input: `property observation.input: any

The input recorded on the observation.`,
  output: `property observation.output: any

The output recorded on the observation.`,
  metadata: `property observation.metadata: any
property Score.metadata?: Record<string, unknown>

The metadata recorded on the observation, or extra metadata stored with a returned score.`,
  itemExpectedOutput: `property experiment.itemExpectedOutput: any

The expected output from the experiment item.`,
  itemMetadata: `property experiment.itemMetadata: any

The metadata from the experiment item.`,
  EvaluationResult: `type EvaluationResult = {
  scores: Score[];
}

The value returned by evaluate.`,
  Score: TYPESCRIPT_SCORE_DOC,
  scores: `property EvaluationResult.scores: Score[]

One or more Langfuse scores to create for the target observation.`,
  dataType: `property Score.dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT"

The Langfuse score data type.`,
  value: `property Score.value: number | string | boolean

The score value. The allowed value depends on dataType: NUMERIC uses number, BOOLEAN uses boolean, and CATEGORICAL or TEXT use string.`,
  name: `property Score.name: string

The score name.`,
  comment: `property Score.comment?: string

The reasoning or explanation stored with the score.`,
  configId: `property Score.configId?: string | null

The score config id to attach to the score.`,
} satisfies CodeEvalHoverDocs;

export const PYTHON_CODE_EVAL_HOVER_DOCS = {
  evaluate: `def evaluate(context: EvaluationContext) -> EvaluationResult

The Python function Langfuse executes for each matched target observation.`,
  context: `parameter context: EvaluationContext

The Python TypedDict value Langfuse passes to evaluate.`,
  ctx: `parameter ctx

Python templates use context: EvaluationContext.`,
  Any: `typing.Any

Use for JSON-like evaluator values whose concrete type depends on the target observation.`,
  TypedDict: `typing.TypedDict

Use to describe the dictionary-shaped Python evaluator context and result.`,
  NotRequired: `typing.NotRequired

Use for optional keys in Python TypedDict definitions.`,
  Observation: `class Observation(TypedDict):
    input: Any
    output: Any
    metadata: Any

The observation selected by the evaluator target.`,
  Experiment: `class Experiment(TypedDict):
    item_expected_output: Any
    item_metadata: Any

Experiment item data. Present when the evaluator runs on an experiment.`,
  EvaluationContext: `class EvaluationContext(TypedDict):
    observation: Observation
    experiment: NotRequired[Experiment | None]

The data Langfuse passes to a Python evaluator.`,
  EvaluationResult: `class EvaluationResult(TypedDict):
    scores: list[Score]

The value returned by evaluate.`,
  Score: PYTHON_SCORE_DOC,
  observation: `key context["observation"]: Observation

The observation selected by the evaluator target.`,
  experiment: `key context.get("experiment"): Experiment | None

Experiment item data. Present when the evaluator runs on an experiment.`,
  input: `key observation["input"]: Any

The input recorded on the observation.`,
  output: `key observation["output"]: Any

The output recorded on the observation.`,
  metadata: `key observation["metadata"] or score["metadata"]

Observation metadata is available on the evaluator context. Score metadata stores extra details on a returned score.`,
  item_expected_output: `key experiment["item_expected_output"]: Any

The expected output from the experiment item.`,
  item_metadata: `key experiment["item_metadata"]: Any

The metadata from the experiment item.`,
  scores: `key result["scores"]: list[Score]

One or more Langfuse scores to create for the target observation.`,
  dataType: `key score["dataType"]: str

The Langfuse score data type. Use NUMERIC, BOOLEAN, CATEGORICAL, or TEXT.`,
  value: `key score["value"]: int | float | str | bool

The score value. The allowed value depends on dataType: NUMERIC uses a number, BOOLEAN uses a boolean, and CATEGORICAL or TEXT use a string.`,
  name: `key score["name"]: str

The score name.`,
  comment: `key score["comment"]: str | None

The reasoning or explanation stored with the score.`,
  configId: `key score["configId"]: str | None

The score config id to attach to the score.`,
} satisfies CodeEvalHoverDocs;

export function getCodeEvalHoverDocs(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
): CodeEvalHoverDocs {
  return sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
    ? PYTHON_CODE_EVAL_HOVER_DOCS
    : TYPESCRIPT_CODE_EVAL_HOVER_DOCS;
}
