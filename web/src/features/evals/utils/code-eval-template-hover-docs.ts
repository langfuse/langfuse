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

A Langfuse score returned by a TypeScript evaluator.`;

const PYTHON_SCORE_DOC = `@dataclass
class Score:
    value: int | float | str | bool
    name: str
    data_type: str | None = None
    comment: str | None = None
    config_id: str | None = None
    metadata: dict[str, Any] | None = None

A Langfuse score returned by a Python evaluator.`;

export const TYPESCRIPT_CODE_EVAL_HOVER_DOCS = {
  evaluate: `function evaluate(ctx: EvaluationContext): EvaluationResult

The TypeScript function Langfuse executes for each matched target observation.`,
  ctx: `parameter ctx: EvaluationContext

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

The data Langfuse passes to a TypeScript evaluator.`,
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
  evaluate: `def evaluate(ctx: EvaluationContext) -> EvaluationResult

The Python function Langfuse executes for each matched target observation.`,
  ctx: `parameter ctx: EvaluationContext

The Python dataclass value Langfuse passes to evaluate.`,
  Any: `typing.Any

Use for JSON-like evaluator values whose concrete type depends on the target observation.`,
  dataclass: `dataclasses.dataclass

Use to describe the Python evaluator context and result classes.`,
  ObservationContext: `@dataclass
class ObservationContext:
    input: Any = None
    output: Any = None
    metadata: Any = None

The observation selected by the evaluator target.`,
  ExperimentContext: `@dataclass
class ExperimentContext:
    item_expected_output: Any = None
    item_metadata: Any = None

Experiment item data. Present when the evaluator runs on an experiment.`,
  EvaluationContext: `@dataclass
class EvaluationContext:
    observation: ObservationContext
    experiment: ExperimentContext | None = None

The data Langfuse passes to a Python evaluator.`,
  EvaluationResult: `@dataclass
class EvaluationResult:
    scores: list[Score]

The value returned by evaluate.`,
  Score: PYTHON_SCORE_DOC,
  observation: `property ctx.observation: ObservationContext

The observation selected by the evaluator target.`,
  experiment: `property ctx.experiment: ExperimentContext | None

Experiment item data. Present when the evaluator runs on an experiment.`,
  input: `property observation.input: Any

The input recorded on the observation.`,
  output: `property observation.output: Any

The output recorded on the observation.`,
  metadata: `property observation.metadata or score.metadata

Observation metadata is available on the evaluator context. Score metadata stores extra details on a returned score.`,
  item_expected_output: `property experiment.item_expected_output: Any

The expected output from the experiment item.`,
  item_metadata: `property experiment.item_metadata: Any

The metadata from the experiment item.`,
  scores: `property result.scores: list[Score]

One or more Langfuse scores to create for the target observation.`,
  data_type: `property score.data_type: str | None

The Langfuse score data type. Use NUMERIC, BOOLEAN, CATEGORICAL, or TEXT.`,
  value: `property score.value: int | float | str | bool

The score value. The allowed value depends on data_type: NUMERIC uses a number, BOOLEAN uses a boolean, and CATEGORICAL or TEXT use a string.`,
  name: `property score.name: str

The score name.`,
  comment: `property score.comment: str | None

The reasoning or explanation stored with the score.`,
  config_id: `property score.config_id: str | None

The score config id to attach to the score.`,
} satisfies CodeEvalHoverDocs;

export function getCodeEvalHoverDocs(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
): CodeEvalHoverDocs {
  return sourceCodeLanguage === "PYTHON"
    ? PYTHON_CODE_EVAL_HOVER_DOCS
    : TYPESCRIPT_CODE_EVAL_HOVER_DOCS;
}
