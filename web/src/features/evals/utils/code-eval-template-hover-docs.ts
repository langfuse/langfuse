import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";

import type { CodeEvalSourceCodeLanguage } from "@/src/features/evals/utils/code-eval-template-starter-examples";

export type CodeEvalHoverDocs = Record<string, string>;

const TYPESCRIPT_SCORE_DOC = `type Score = {
  name?: string;
  comment?: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT";
  value: number | string | boolean;
}

A Langfuse score returned by a TypeScript evaluator. The contract is shown at the top of the editor and is locked.`;

const PYTHON_SCORE_DOC = `class Score(TypedDict):
    value: int | float | str | bool
    name: NotRequired[str]
    dataType: NotRequired[str]
    comment: NotRequired[str | None]
    configId: NotRequired[str | None]
    metadata: NotRequired[dict[str, Any]]

A Langfuse score returned by a Python evaluator.`;

export const TYPESCRIPT_CODE_EVAL_HOVER_DOCS = {
  evaluate: `export function evaluate(context: EvaluationContext): EvaluationResult | Promise<EvaluationResult>

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
        expectedOutput: any;
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
  expectedOutput: any;
  itemMetadata: any;
}

Dataset run item data. Present when the evaluator runs on an experiment.`,
  input: `property observation.input: any

The input recorded on the observation.`,
  output: `property observation.output: any

The output recorded on the observation.`,
  metadata: `property observation.metadata: any

The metadata recorded on the observation.`,
  expectedOutput: `property experiment.expectedOutput: any

The expected output from the dataset item.`,
  itemMetadata: `property experiment.itemMetadata: any

The metadata from the dataset item.`,
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
  name: `property Score.name?: string

The score name. When omitted, Langfuse uses the evaluator's configured score name.`,
  comment: `property Score.comment?: string

The reasoning or explanation stored with the score.`,
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
    expected_output: Any
    item_metadata: Any

Dataset run item data. Present when the evaluator runs on an experiment.`,
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

Dataset run item data. Present when the evaluator runs on an experiment.`,
  input: `key observation["input"]: Any

The input recorded on the observation.`,
  output: `key observation["output"]: Any

The output recorded on the observation.`,
  metadata: `key observation["metadata"] or score["metadata"]

Observation metadata is available on the evaluator context. Score metadata stores extra details on a returned score.`,
  expected_output: `key experiment["expected_output"]: Any

The expected output from the dataset item.`,
  item_metadata: `key experiment["item_metadata"]: Any

The metadata from the dataset item.`,
  scores: `key result["scores"]: list[Score]

One or more Langfuse scores to create for the target observation.`,
  dataType: `key score["dataType"]: str

The Langfuse score data type. Use NUMERIC, BOOLEAN, CATEGORICAL, or TEXT when setting it explicitly.`,
  value: `key score["value"]: int | float | str | bool

The score value. The allowed value depends on dataType: NUMERIC uses a number, BOOLEAN uses a boolean, and CATEGORICAL or TEXT use a string.`,
  name: `key score["name"]: str

The score name. When omitted, Langfuse uses the evaluator's configured score name.`,
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
