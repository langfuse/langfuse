import {
  CODE_EVAL_COMPLETION_CONTRACT,
  type CodeEvalSourceCodeLanguage,
  type PythonCodeEvalCompletionName,
  type PythonTraceCodeEvalCompletionName,
  type TypeScriptCodeEvalCompletionName,
  type TypeScriptTraceCodeEvalCompletionName,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

export type CodeEvalHoverDocs = Record<string, string>;

// ToolCall-only hover keys collide with everyday identifiers (`type Foo`, a
// local `index` or `id`), so the hover extension only documents them on
// actual property accesses. `name` stays word-keyed: it doubles as the Score
// property / keyword argument. Labels are identical across both languages.
export const PROPERTY_ACCESS_ONLY_HOVER_KEYS: ReadonlySet<string> = new Set(
  CODE_EVAL_COMPLETION_CONTRACT.TYPESCRIPT.toolCallProperties
    .map((property) => property.label)
    .filter((label) => label !== "name"),
);

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

const TYPESCRIPT_TOOL_CALL_DOC = `type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
  type: string;
  index: number;
}

A tool call recorded on the observation. arguments is the parsed
argument object when the recorded value was valid JSON.`;

const PYTHON_TOOL_CALL_DOC = `@dataclass
class ToolCall:
    id: str = ""
    name: str = ""
    arguments: Any = None
    type: str = ""
    index: int = 0

A tool call recorded on the observation. arguments is the parsed
argument object when the recorded value was valid JSON.`;

const TYPESCRIPT_CODE_EVAL_HOVER_DOCS = {
  evaluate: `function evaluate(ctx: EvaluationContext): EvaluationResult

The TypeScript function Langfuse executes for each matched target observation.`,
  ctx: `parameter ctx: EvaluationContext

The TypeScript value Langfuse passes to evaluate.`,
  EvaluationContext: `type EvaluationContext = {
  observation: {
    input: any;
    output: any;
    metadata: any;
    toolCalls: ToolCall[];
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
  toolCalls: ToolCall[];
}

The observation selected by the evaluator target.`,
  ToolCall: TYPESCRIPT_TOOL_CALL_DOC,
  toolCalls: `property observation.toolCalls: ToolCall[]

The tool calls recorded on the observation, in the order the model emitted them.`,
  id: `property ToolCall.id: string

The tool call identifier emitted by the model provider.`,
  arguments: `property ToolCall.arguments: unknown

The parsed tool arguments when the recorded value was valid JSON.`,
  type: `property ToolCall.type: string

The recorded tool-call type.`,
  index: `property ToolCall.index: number

The tool call position in the model response.`,
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
  name: `property Score.name or ToolCall.name: string

The score name, or the function name invoked by a tool call.`,
  comment: `property Score.comment?: string

The reasoning or explanation stored with the score.`,
  configId: `property Score.configId?: string | null

The score config id to attach to the score.`,
} satisfies CodeEvalHoverDocs &
  Record<TypeScriptCodeEvalCompletionName, string>;

const PYTHON_CODE_EVAL_HOVER_DOCS = {
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
    tool_calls: list[ToolCall] = field(default_factory=list)

The observation selected by the evaluator target.`,
  ToolCall: PYTHON_TOOL_CALL_DOC,
  tool_calls: `property observation.tool_calls: list[ToolCall]

The tool calls recorded on the observation, in the order the model emitted
them. arguments is the parsed argument object when the recorded value was
valid JSON.`,
  id: `property ToolCall.id: str

The tool call identifier emitted by the model provider.`,
  arguments: `property ToolCall.arguments: Any

The parsed tool arguments when the recorded value was valid JSON.`,
  type: `property ToolCall.type: str

The recorded tool-call type.`,
  index: `property ToolCall.index: int

The tool call position in the model response.`,
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
  name: `property score.name or ToolCall.name: str

The score name, or the function name invoked by a tool call.`,
  comment: `property score.comment: str | None

The reasoning or explanation stored with the score.`,
  config_id: `property score.config_id: str | None

The score config id to attach to the score.`,
} satisfies CodeEvalHoverDocs & Record<PythonCodeEvalCompletionName, string>;

const THREAD_SHAPE_DOC = `Each thread has one messages list, replayed
history first, matching the threads LLM-as-a-judge evaluators read. Messages
are normalized: role, parts (text, reasoning, tool-call, tool-result, file,
data, custom) and source. Messages this trace produced also carry
observationId, traceId, and the source observation's startTime and endTime as
ISO strings; replayed history has none.`;

const TYPESCRIPT_TRACE_HOVER_DOCS = {
  evaluate: `function evaluate(ctx: EvaluationContext<"observation" | "trace">): EvaluationResult

The TypeScript function Langfuse executes for each matched target observation or trace.`,
  EvaluationContext: `type EvaluationContext<T extends "observation" | "trace" = "observation"> =
  Extract<
    ObservationEvaluationContext | TraceEvaluationContext,
    { targetType: T }
  >;

The data Langfuse passes to a TypeScript evaluator. Observation rules pass
EvaluationContext<"observation"> (the default), trace rules pass
EvaluationContext<"trace">.`,
  ObservationEvaluationContext: `type ObservationEvaluationContext = {
  targetType: "observation";
  observation: {
    input: any;
    output: any;
    metadata: any;
    toolCalls: ToolCall[];
  };
  experiment:
    | {
        itemExpectedOutput: any;
        itemMetadata: any;
      }
    | undefined;
}

The data Langfuse passes for an observation target.`,
  TraceEvaluationContext: `type TraceEvaluationContext = {
  targetType: "trace";
  trace: {
    threads: TraceThread[];
  };
}

The data Langfuse passes for a trace target.`,
  TraceThread: `type TraceThread = { messages: TraceMessage[] }

${THREAD_SHAPE_DOC}`,
  TraceMessage: `type TraceMessage = {
  role: "system" | "user" | "assistant" | "tool";
  parts: MessagePart[];
  source: "input" | "output";
  id?: string;
  senderName?: string;
  finishReason?: { type: "stop" | "length" | ...; raw: string };
  observationId?: string;
  traceId?: string;
  startTime?: string;
  endTime?: string | null;
}

One normalized message of a trace thread. observationId, traceId, startTime
and endTime (ISO 8601) are set only on messages this trace produced.`,
  targetType: `property EvaluationContext.targetType: "observation" | "trace"

Whether the evaluator runs on an observation or on a trace transcript.`,
  trace: `property TraceEvaluationContext.trace: {
  threads: TraceThread[];
}

The trace selected by the evaluator target.`,
  threads: `property trace.threads: TraceThread[]

The conversation threads of the trace transcript. ${THREAD_SHAPE_DOC}`,
} satisfies CodeEvalHoverDocs &
  Record<TypeScriptTraceCodeEvalCompletionName, string>;

const PYTHON_TRACE_HOVER_DOCS = {
  EvaluationContext: `@dataclass
class EvaluationContext:
    observation: ObservationContext | None = None
    experiment: ExperimentContext | None = None
    trace: TraceContext | None = None
    target_type: str = "observation"

The data Langfuse passes to a Python evaluator. target_type is "observation"
or "trace". Only the target's own context is set: observation for
observation targets, trace for trace targets.`,
  TraceContext: `@dataclass
class TraceContext:
    threads: list[dict[str, Any]] = field(default_factory=list)

The trace selected by the evaluator target.`,
  observation: `property ctx.observation: ObservationContext | None

The observation selected by the evaluator target. None for trace targets.`,
  trace: `property ctx.trace: TraceContext | None

The trace selected by the evaluator target. None for observation targets.`,
  target_type: `property ctx.target_type: str

"observation" or "trace": whether the evaluator runs on an observation or on a trace transcript.`,
  threads: `property trace.threads: list[dict[str, Any]]

The conversation threads of the trace transcript, as dicts with camelCase
keys. ${THREAD_SHAPE_DOC}`,
} satisfies CodeEvalHoverDocs &
  Record<PythonTraceCodeEvalCompletionName, string>;

export function getCodeEvalHoverDocs(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
  traceEvalsAvailable = false,
): CodeEvalHoverDocs {
  if (sourceCodeLanguage === "PYTHON") {
    return traceEvalsAvailable
      ? { ...PYTHON_CODE_EVAL_HOVER_DOCS, ...PYTHON_TRACE_HOVER_DOCS }
      : PYTHON_CODE_EVAL_HOVER_DOCS;
  }
  return traceEvalsAvailable
    ? { ...TYPESCRIPT_CODE_EVAL_HOVER_DOCS, ...TYPESCRIPT_TRACE_HOVER_DOCS }
    : TYPESCRIPT_CODE_EVAL_HOVER_DOCS;
}
