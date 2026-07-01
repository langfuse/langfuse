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

export const DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE = `${TYPESCRIPT_CODE_EVAL_CONTRACT}

function evaluate(ctx: EvaluationContext): EvaluationResult {
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

export const DEFAULT_PYTHON_CODE_EVAL_SOURCE = `${PYTHON_CODE_EVAL_CONTRACT}


def evaluate(ctx: EvaluationContext) -> EvaluationResult:
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
    )
`;

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

export function getCodeEvalSourceForEditor({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode?: string | null;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}) {
  if (!sourceCode?.trim()) return getDefaultCodeEvalSource(sourceCodeLanguage);

  if (sourceCodeLanguage === "PYTHON") {
    return sourceCode.trimStart().startsWith(PYTHON_CODE_EVAL_CONTRACT)
      ? sourceCode
      : `${PYTHON_CODE_EVAL_CONTRACT}\n\n${sourceCode.trimStart()}`;
  }

  return sourceCode.startsWith(TYPESCRIPT_CODE_EVAL_CONTRACT)
    ? sourceCode
    : `${TYPESCRIPT_CODE_EVAL_CONTRACT}\n\n${sourceCode.trimStart()}`;
}

async function formatTypeScriptSource(source: string): Promise<string> {
  const [{ format }, typescriptPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/estree"),
  ]);

  return format(source, {
    parser: "typescript",
    plugins: [typescriptPlugin, estreePlugin],
  });
}

async function formatPythonSource(source: string): Promise<string> {
  const ruffModule = await import("@astral-sh/ruff-wasm-web");
  await ruffModule.default();

  const workspace = new ruffModule.Workspace(
    {
      "line-length": 88,
      "indent-width": 4,
    },
    ruffModule.PositionEncoding.Utf16,
  );

  return workspace.format(source);
}

/**
 * Formats the source code and strips the contract types for submission.
 * For Python: Formats with Ruff, then extracts starting from `def evaluate(`.
 * For TypeScript: Strips contract types, formats with prettier, then returns.
 */
export async function formatAndStripCodeEvalSourceForSubmit({
  sourceCode,
  sourceCodeLanguage,
}: {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}): Promise<string> {
  if (sourceCodeLanguage === "PYTHON") {
    const evaluateMatch = sourceCode.match(/(?:^|\n)\s*def\s+evaluate\s*\(/);
    if (!evaluateMatch || evaluateMatch.index === undefined) {
      return sourceCode.trim();
    }

    const strippedSource = sourceCode
      .slice(evaluateMatch.index)
      .trimStart()
      .trimEnd();

    try {
      return (await formatPythonSource(strippedSource)).trimEnd();
    } catch {
      return strippedSource;
    }
  }

  // TypeScript: strip contract types first, then format
  const strippedSource = sourceCode.startsWith(TYPESCRIPT_CODE_EVAL_CONTRACT)
    ? sourceCode.slice(TYPESCRIPT_CODE_EVAL_CONTRACT.length).trim()
    : sourceCode.trim();

  try {
    return (await formatTypeScriptSource(strippedSource)).trimEnd();
  } catch {
    return strippedSource;
  }
}
