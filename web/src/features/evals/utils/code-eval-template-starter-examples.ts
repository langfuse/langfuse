import type { ToolCallForEval } from "@langfuse/shared";

// Compact contract metadata drives editor completions and type-checks hover-doc
// coverage. Keep the executable declarations below readable for users.
const SCORE_DATA_TYPE_VALUES = [
  "NUMERIC",
  "BOOLEAN",
  "CATEGORICAL",
  "TEXT",
] as const;

export const CODE_EVAL_COMPLETION_CONTRACT = {
  TYPESCRIPT: {
    pathProperties: {
      ctx: [
        { label: "observation", detail: 'EvaluationContext["observation"]' },
        {
          label: "experiment",
          detail: 'EvaluationContext["experiment"]',
        },
      ],
      "ctx.observation": [
        { label: "input", detail: "any" },
        { label: "output", detail: "any" },
        { label: "metadata", detail: "any" },
        { label: "toolCalls", detail: "ToolCall[]" },
      ],
      "ctx.experiment": [
        { label: "itemExpectedOutput", detail: "any" },
        { label: "itemMetadata", detail: "any" },
      ],
    },
    toolCallProperties: [
      { label: "id", detail: "string" },
      { label: "name", detail: "string" },
      { label: "arguments", detail: "unknown" },
      { label: "type", detail: "string" },
      { label: "index", detail: "number" },
    ],
    resultType: { label: "EvaluationResult", detail: "{ scores: Score[] }" },
    resultProperties: [{ label: "scores", detail: "Score[]" }],
    scoreProperties: [
      { label: "name", detail: "string" },
      { label: "value", detail: "number | string | boolean" },
      {
        label: "dataType",
        detail: '"NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT"',
      },
      { label: "comment", detail: "string | undefined" },
      { label: "configId", detail: "string | null | undefined" },
      {
        label: "metadata",
        detail: "Record<string, unknown> | undefined",
      },
    ],
    dataTypeValues: SCORE_DATA_TYPE_VALUES,
  },
  PYTHON: {
    pathProperties: {
      ctx: [
        { label: "observation", detail: "ObservationContext" },
        { label: "experiment", detail: "ExperimentContext | None" },
      ],
      "ctx.observation": [
        { label: "input", detail: "Any" },
        { label: "output", detail: "Any" },
        { label: "metadata", detail: "Any" },
        { label: "tool_calls", detail: "list[ToolCall]" },
      ],
      "ctx.experiment": [
        { label: "item_expected_output", detail: "Any" },
        { label: "item_metadata", detail: "Any" },
      ],
    },
    toolCallProperties: [
      { label: "id", detail: "str" },
      { label: "name", detail: "str" },
      { label: "arguments", detail: "Any" },
      { label: "type", detail: "str" },
      { label: "index", detail: "int" },
    ],
    resultConstructors: [
      { label: "EvaluationResult", detail: "dataclass" },
      { label: "Score", detail: "dataclass" },
    ],
    constructorParameters: {
      EvaluationResult: [{ label: "scores", detail: "list[Score]" }],
      Score: [
        { label: "value", detail: "int | float | str | bool" },
        { label: "name", detail: "str" },
        { label: "data_type", detail: "str | None" },
        { label: "comment", detail: "str | None" },
        { label: "config_id", detail: "str | None" },
        { label: "metadata", detail: "dict[str, Any] | None" },
      ],
    },
    dataTypeValues: SCORE_DATA_TYPE_VALUES,
  },
} as const;

type Labels<T> = T extends readonly { label: infer Label extends string }[]
  ? Label
  : never;

type TypeScriptCompletionContract =
  (typeof CODE_EVAL_COMPLETION_CONTRACT)["TYPESCRIPT"];
type TypeScriptPathProperties =
  TypeScriptCompletionContract["pathProperties"][keyof TypeScriptCompletionContract["pathProperties"]];

export type TypeScriptCodeEvalCompletionName =
  | Labels<TypeScriptPathProperties>
  | Labels<TypeScriptCompletionContract["toolCallProperties"]>
  | TypeScriptCompletionContract["resultType"]["label"]
  | Labels<TypeScriptCompletionContract["resultProperties"]>
  | Labels<TypeScriptCompletionContract["scoreProperties"]>;

type PythonCompletionContract =
  (typeof CODE_EVAL_COMPLETION_CONTRACT)["PYTHON"];
type PythonPathProperties =
  PythonCompletionContract["pathProperties"][keyof PythonCompletionContract["pathProperties"]];
type PythonConstructorParameters =
  PythonCompletionContract["constructorParameters"][keyof PythonCompletionContract["constructorParameters"]];

export type PythonCodeEvalCompletionName =
  | Labels<PythonPathProperties>
  | Labels<PythonCompletionContract["toolCallProperties"]>
  | Labels<PythonCompletionContract["resultConstructors"]>
  | Labels<PythonConstructorParameters>;

type MutuallyExtends<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type Expect<T extends true> = T;

// Compile-time lockstep with the runtime evaluator payload: adding or
// removing a field on ToolCallForEval breaks the web build until the editor
// completions (and, via the hover-doc Record checks, the hover docs) follow.
export type TypeScriptToolCallCompletionsMatchRuntime = Expect<
  MutuallyExtends<
    Labels<TypeScriptCompletionContract["toolCallProperties"]>,
    keyof ToolCallForEval
  >
>;
export type PythonToolCallCompletionsMatchRuntime = Expect<
  MutuallyExtends<
    Labels<PythonCompletionContract["toolCallProperties"]>,
    keyof ToolCallForEval
  >
>;

export const TYPESCRIPT_CODE_EVAL_CONTRACT = `type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
  type: string;
  index: number;
};

type EvaluationContext = {
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
};

type ScoreBase = {
  name: string;
  comment?: string;
  configId?: string | null;
  metadata?: Record<string, unknown>;
};

type NumericScore = ScoreBase & { dataType: "NUMERIC"; value: number };
type BooleanScore = ScoreBase & { dataType: "BOOLEAN"; value: boolean };
type CategoricalScore = ScoreBase & { dataType: "CATEGORICAL"; value: string };
type TextScore = ScoreBase & { dataType: "TEXT"; value: string };

type Score = NumericScore | BooleanScore | CategoricalScore | TextScore;

type EvaluationResult = {
  scores: Score[];
};
`;

// Keep in sync with the Prettier output so the Format button is a no-op on
// the untouched starter code.
export const DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE = `function evaluate(ctx: EvaluationContext): EvaluationResult {
  const input = ctx.observation.input;
  const matchesOutput = input !== undefined && ctx.observation.output === input;

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
}`;

export const PYTHON_CODE_EVAL_CONTRACT = `from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str = ""
    name: str = ""
    arguments: Any = None
    type: str = ""
    index: int = 0


@dataclass
class ObservationContext:
    input: Any = None
    output: Any = None
    metadata: Any = None
    tool_calls: list[ToolCall] = field(default_factory=list)


@dataclass
class ExperimentContext:
    item_expected_output: Any = None
    item_metadata: Any = None


@dataclass
class EvaluationContext:
    observation: ObservationContext
    experiment: ExperimentContext | None = None


@dataclass
class Score:
    value: int | float | str | bool
    name: str
    data_type: str | None = None
    comment: str | None = None
    config_id: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class EvaluationResult:
    scores: list[Score]
`;

export const DEFAULT_PYTHON_CODE_EVAL_SOURCE = `def evaluate(ctx: EvaluationContext) -> EvaluationResult:
  """Evaluates one observation and returns one or more Langfuse scores."""
  input = ctx.observation.input
  matches_output = input is not None and ctx.observation.output == input

  return EvaluationResult(
    scores=[
      Score(
        name="Exact match",
        value=matches_output,
        data_type="BOOLEAN",
        comment=(
          "Output exactly matches the input."
          if matches_output
          else "Output does not match the input."
        ),
      )
    ]
  )`;

// Contract versions previously shipped and possibly embedded verbatim in
// stored template sources (the public API stores sourceCode as-is, and full
// docs examples get pasted into the editor). When changing a contract above,
// append the outgoing text here so sources saved under it keep stripping
// cleanly in the editor.
export const PREVIOUS_TYPESCRIPT_CODE_EVAL_CONTRACTS: string[] = [
  // pre-ToolCall (before tool calls were passed to code evaluators)
  `type EvaluationContext = {
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
};

type ScoreBase = {
  name: string;
  comment?: string;
  configId?: string | null;
  metadata?: Record<string, unknown>;
};

type NumericScore = ScoreBase & { dataType: "NUMERIC"; value: number };
type BooleanScore = ScoreBase & { dataType: "BOOLEAN"; value: boolean };
type CategoricalScore = ScoreBase & { dataType: "CATEGORICAL"; value: string };
type TextScore = ScoreBase & { dataType: "TEXT"; value: string };

type Score = NumericScore | BooleanScore | CategoricalScore | TextScore;

type EvaluationResult = {
  scores: Score[];
};
`,
  // original code-eval release (JSDoc-annotated contract, cf24ee840)
  `/**
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
`,
];

export const PREVIOUS_PYTHON_CODE_EVAL_CONTRACTS: string[] = [
  // pre-ToolCall (before tool calls were passed to code evaluators)
  `from dataclasses import dataclass
from typing import Any


@dataclass
class ObservationContext:
    input: Any = None
    output: Any = None
    metadata: Any = None


@dataclass
class ExperimentContext:
    item_expected_output: Any = None
    item_metadata: Any = None


@dataclass
class EvaluationContext:
    observation: ObservationContext
    experiment: ExperimentContext | None = None


@dataclass
class Score:
    value: int | float | str | bool
    name: str
    data_type: str | None = None
    comment: str | None = None
    config_id: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class EvaluationResult:
    scores: list[Score]
`,
];

export type CodeEvalSourceCodeLanguage = "PYTHON" | "TYPESCRIPT";

export function getDefaultCodeEvalSource(
  sourceCodeLanguage: CodeEvalSourceCodeLanguage,
) {
  return sourceCodeLanguage === "PYTHON"
    ? DEFAULT_PYTHON_CODE_EVAL_SOURCE
    : DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE;
}

export function isDefaultCodeEvalSource(sourceCode: string) {
  return (
    sourceCode === DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE ||
    sourceCode === DEFAULT_PYTHON_CODE_EVAL_SOURCE
  );
}

// The contract type declarations are not shown in the editor; they are
// documented at
// https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators#function-contract
// and only prepended behind the scenes for validation.
//
// Stripping is still required because sources can contain the contract via
// two paths the UI does not control: templates created through the public
// API (sourceCode is stored verbatim) and full docs examples pasted into the
// editor.
function stripCodeEvalContract({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}) {
  // Sources stored before a contract bump embed the outgoing contract text,
  // so try every shipped version, newest first.
  const contracts =
    sourceCodeLanguage === "PYTHON"
      ? [PYTHON_CODE_EVAL_CONTRACT, ...PREVIOUS_PYTHON_CODE_EVAL_CONTRACTS]
      : [
          TYPESCRIPT_CODE_EVAL_CONTRACT,
          ...PREVIOUS_TYPESCRIPT_CODE_EVAL_CONTRACTS,
        ];
  const source = sourceCode.trimStart();
  const matchedContract = contracts.find((contract) =>
    source.startsWith(contract),
  );

  return matchedContract
    ? source.slice(matchedContract.length).trimStart()
    : source;
}

export function getCodeEvalSourceForEditor({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode?: string | null;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}) {
  if (!sourceCode?.trim()) return getDefaultCodeEvalSource(sourceCodeLanguage);

  return stripCodeEvalContract({ sourceCode, sourceCodeLanguage });
}

async function formatTypeScriptSource(source: string): Promise<string> {
  // babel-ts instead of the typescript plugin: the latter embeds the
  // TypeScript compiler, which the SWC minifier miscompiles (dropped
  // bindings — LFE-10645, caught by scripts/scan-client-bundle.mjs).
  const [{ format }, babelPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);

  return format(source, {
    parser: "babel-ts",
    plugins: [babelPlugin, estreePlugin],
  });
}

async function formatPythonSource(source: string): Promise<string> {
  const ruffModule = await import("@astral-sh/ruff-wasm-web");
  await ruffModule.default();

  const workspace = new ruffModule.Workspace(
    {
      "line-length": 88,
      "indent-width": 2,
    },
    ruffModule.PositionEncoding.Utf16,
  );

  return workspace.format(source);
}

/**
 * Formats the source code for submission and strips the contract types in
 * case they were pasted into the editor.
 */
export async function formatAndStripCodeEvalSourceForSubmit({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}): Promise<string> {
  const strippedSource = stripCodeEvalContract({
    sourceCode,
    sourceCodeLanguage,
  }).trim();

  try {
    const formattedSource =
      sourceCodeLanguage === "PYTHON"
        ? await formatPythonSource(strippedSource)
        : await formatTypeScriptSource(strippedSource);

    return formattedSource.trimEnd();
  } catch {
    return strippedSource;
  }
}
