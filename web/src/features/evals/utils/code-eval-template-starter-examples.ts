export const TYPESCRIPT_CODE_EVAL_CONTRACT = `type EvaluationContext = {
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

export const PYTHON_CODE_EVAL_CONTRACT = `from dataclasses import dataclass
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
  const contract =
    sourceCodeLanguage === "PYTHON"
      ? PYTHON_CODE_EVAL_CONTRACT
      : TYPESCRIPT_CODE_EVAL_CONTRACT;
  const source = sourceCode.trimStart();

  return source.startsWith(contract)
    ? source.slice(contract.length).trimStart()
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
