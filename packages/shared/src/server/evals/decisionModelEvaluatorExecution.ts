import { ScoreDataTypeEnum } from "../../domain/scores";
import type { EvalExecutionContext } from "../../features/evals/evalExecutionMetadata";
import {
  resolvePersistedEvalOutputDefinition,
  type EvalOutputResult,
  type PersistedEvalOutputDefinition,
} from "../../features/evals/outputDefinition";
import { stringifyValue } from "../../utils/stringChecks";
import {
  INTERNAL_TRACE_EVENT_SOURCE,
  type InternalTraceEventInput,
} from "../llm/internalTraceEvents";
import {
  LangfuseInternalTraceEnvironment,
  type InternalTraceWriteInput,
} from "../llm/types";
import type { ExtractedVariable } from "./extractObservationVariables";

/**
 * Decision-model evaluators (experimental) ask a System One model such as
 * TypeSafe Jev one Choice question about the evaluated observation. The model
 * returns a label plus a probability distribution instead of generated text.
 *
 * The question and answer shapes mirror the AI SDK's experimental
 * `EvaluationModel` contract so the HTTP client can be swapped for the SDK
 * provider without touching the evaluator.
 */

export type DecisionModelChoiceQuestion = {
  type: "choice";
  instructions: string;
  /** Option name to description. `null` sends the bare option name. */
  criteria: Record<string, string | null>;
};

export type DecisionModelChoiceAnswer = {
  type: "choice";
  /** The option with the highest probability. */
  choice: string;
  /** Distribution over the options; sums to 1. */
  probabilities: Record<string, number>;
  /**
   * How concentrated the distribution is, from 0 (uniform) to 1 (one option).
   * Derived from `probabilities`; not the probability of `choice`.
   */
  confidence: number | null;
};

export type DecisionModelEvaluation = {
  /** The resolved model version, e.g. `jev-1.13.0` when `jev-latest` was requested. */
  model: string;
  answer: DecisionModelChoiceAnswer;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
};

export type DecisionModelClient = {
  evaluateChoice: (params: {
    state: Record<string, unknown>;
    question: DecisionModelChoiceQuestion;
  }) => Promise<DecisionModelEvaluation>;
};

/**
 * Thrown when the evaluator definition or the model answer cannot be mapped to
 * a score. Callers treat this as a permanent failure of the job.
 */
export class DecisionModelEvaluatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionModelEvaluatorError";
  }
}

/**
 * The state is a JSON object keyed by variable name. Absent fields are dropped
 * so the model only sees material that exists on the observation.
 */
export function buildDecisionModelState(
  variables: ExtractedVariable[],
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const variable of variables) {
    // An empty string is a real value (a model that answered nothing); only
    // fields the observation does not have are dropped.
    if (variable.value === null || variable.value === undefined) continue;
    state[variable.var] = variable.value;
  }
  return state;
}

export function buildDecisionModelChoiceQuestion(params: {
  instructions: string;
  outputDefinition: PersistedEvalOutputDefinition;
}): DecisionModelChoiceQuestion {
  const instructions = params.instructions.trim();
  if (!instructions) {
    throw new DecisionModelEvaluatorError(
      "Decision-model evaluators require question instructions",
    );
  }

  const resolved = resolvePersistedEvalOutputDefinition(
    params.outputDefinition,
  );
  if (resolved.dataType !== ScoreDataTypeEnum.CATEGORICAL) {
    throw new DecisionModelEvaluatorError(
      "Decision-model evaluators require a categorical output definition",
    );
  }
  if (resolved.shouldAllowMultipleMatches) {
    throw new DecisionModelEvaluatorError(
      "Decision-model evaluators select exactly one category",
    );
  }
  if (resolved.categories.length < 2) {
    throw new DecisionModelEvaluatorError(
      "Decision-model evaluators require at least two categories",
    );
  }

  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(
      resolved.categories.map((category) => [category, null]),
    ),
  };
}

function formatProbability(value: number) {
  return value.toFixed(2);
}

/**
 * Decision models return no rationale, so the comment carries the numbers a
 * reviewer needs to judge the verdict from the trace view.
 */
export function formatDecisionModelComment(
  evaluation: DecisionModelEvaluation,
): string {
  const { answer, model } = evaluation;
  const ranked = Object.entries(answer.probabilities).sort(
    ([, a], [, b]) => b - a,
  );
  const winnerProbability = answer.probabilities[answer.choice];
  const parts = [
    winnerProbability === undefined
      ? answer.choice
      : `${answer.choice} (p=${formatProbability(winnerProbability)})`,
  ];
  if (answer.confidence !== null) {
    parts.push(`confidence ${formatProbability(answer.confidence)}`);
  }
  const runnerUp = ranked.find(([option]) => option !== answer.choice);
  if (runnerUp) {
    parts.push(`runner-up ${runnerUp[0]} (${formatProbability(runnerUp[1])})`);
  }
  parts.push(model);
  return parts.join(" · ");
}

export function toDecisionModelScoreMetadata(
  evaluation: DecisionModelEvaluation,
): Record<string, unknown> {
  return {
    decisionModel: {
      model: evaluation.model,
      choice: evaluation.answer.choice,
      confidence: evaluation.answer.confidence,
      probabilities: evaluation.answer.probabilities,
    },
  };
}

/**
 * One-span execution trace so the "view execution trace" link on a decision
 * model score shows exactly what was sent (state and question) and returned.
 */
export function buildDecisionModelTraceInput(params: {
  projectId: string;
  executionTraceId: string;
  traceStartTime: Date;
  traceName: string;
  state: Record<string, unknown>;
  question: DecisionModelChoiceQuestion;
  evaluation: DecisionModelEvaluation;
  metadata: Record<string, unknown>;
  evaluationContext?: EvalExecutionContext;
}): InternalTraceWriteInput {
  const usage = params.evaluation.usage;
  const eventInput: InternalTraceEventInput = {
    projectId: params.projectId,
    traceId: params.executionTraceId,
    spanId: params.executionTraceId,
    startTimeISO: params.traceStartTime.toISOString(),
    endTimeISO: new Date().toISOString(),
    name: params.traceName,
    traceName: params.traceName,
    type: "GENERATION",
    environment: LangfuseInternalTraceEnvironment.LLMJudge,
    modelName: params.evaluation.model,
    input: stringifyValue({
      state: params.state,
      questions: { verdict: params.question },
    }),
    output: stringifyValue(params.evaluation.answer),
    ...(usage
      ? {
          providedUsageDetails: {
            ...(usage.inputTokens !== null ? { input: usage.inputTokens } : {}),
            ...(usage.outputTokens !== null
              ? { output: usage.outputTokens }
              : {}),
          },
        }
      : {}),
    metadata: params.metadata,
    evaluationContext: params.evaluationContext,
    source: INTERNAL_TRACE_EVENT_SOURCE,
  };

  return {
    rootSpanId: params.executionTraceId,
    eventInputs: [eventInput],
  };
}

export async function executeDecisionModelEvaluator(params: {
  instructions: string;
  variables: ExtractedVariable[];
  outputDefinition: PersistedEvalOutputDefinition;
  client: DecisionModelClient;
}) {
  const question = buildDecisionModelChoiceQuestion({
    instructions: params.instructions,
    outputDefinition: params.outputDefinition,
  });
  const state = buildDecisionModelState(params.variables);

  const evaluation = await params.client.evaluateChoice({ state, question });

  if (!Object.hasOwn(question.criteria, evaluation.answer.choice)) {
    throw new DecisionModelEvaluatorError(
      `Decision model returned "${evaluation.answer.choice}", which is not one of the configured categories`,
    );
  }

  const output: EvalOutputResult = {
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    matches: [evaluation.answer.choice],
    reasoning: formatDecisionModelComment(evaluation),
  };

  return {
    state,
    question,
    evaluation,
    output,
    scoreMetadata: toDecisionModelScoreMetadata(evaluation),
  };
}
