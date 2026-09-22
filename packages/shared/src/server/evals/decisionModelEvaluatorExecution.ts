import { ScoreDataTypeEnum } from "../../domain/scores";
import {
  DecisionModelQuestionType,
  type DecisionModelEntry,
  type DecisionModelQuestion,
  type DecisionModelQuestions,
} from "../../features/evals/decisionModel";
import type { EvalExecutionContext } from "../../features/evals/evalExecutionMetadata";
import { stringifyValue } from "../../utils/stringChecks";
import {
  INTERNAL_TRACE_EVENT_SOURCE,
  type InternalTraceEventInput,
} from "../llm/internalTraceEvents";
import {
  LangfuseInternalTraceEnvironment,
  type InternalTraceWriteInput,
} from "../llm/types";
import type { CodeEvalScoreWithName } from "./codeEvalDispatcherTypes";
import type { ExtractedVariable } from "./extractObservationVariables";

/**
 * Decision-model evaluators (experimental) send one state and N typed
 * questions to a System One model such as TypeSafe Jev in a single call and
 * turn every answer into a score. The request and answer shapes mirror the AI
 * SDK's experimental `EvaluationModel` contract.
 */

export type DecisionModelRequestQuestion =
  | {
      type: "choice";
      instructions: DecisionModelEntry;
      criteria: Record<string, DecisionModelEntry | null>;
    }
  | {
      type: "score";
      instructions: DecisionModelEntry;
      criteria: DecisionModelEntry[];
    }
  | {
      type: "boolean";
      instructions: DecisionModelEntry;
      criteria?: {
        true?: DecisionModelEntry | null;
        false?: DecisionModelEntry | null;
      };
    };

export type DecisionModelRequest = {
  state: Record<string, unknown>;
  questions: Record<string, DecisionModelRequestQuestion>;
};

export type DecisionModelAnswer =
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      /** How peaked the distribution is (0–1); derived, not the winner's probability. */
      confidence: number | null;
    }
  | {
      type: "score";
      /** Probability-weighted level, a float in [0, levels − 1]. */
      score: number;
      probabilities: Record<string, number>;
      confidence: number | null;
    }
  | {
      type: "boolean";
      /** P(true). Noul answers carry no separate confidence. */
      probability: number;
    };

export type DecisionModelEvaluation = {
  /** Resolved model version, e.g. `jev-1.13.0` when `jev-latest` was requested. */
  model: string;
  answers: Record<string, DecisionModelAnswer>;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
};

export type DecisionModelClient = {
  evaluate: (request: DecisionModelRequest) => Promise<DecisionModelEvaluation>;
};

/**
 * Thrown when the definition or an answer cannot be turned into scores.
 * Callers treat this as a permanent failure of the job.
 */
export class DecisionModelEvaluatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionModelEvaluatorError";
  }
}

/**
 * The state is a JSON object keyed by the mapped variable names. Fields the
 * observation does not have are dropped; empty strings are real values.
 */
export function buildDecisionModelState(
  variables: ExtractedVariable[],
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const variable of variables) {
    if (variable.value === null || variable.value === undefined) continue;
    state[variable.var] = variable.value;
  }
  return state;
}

export function toDecisionModelRequestQuestion(
  question: DecisionModelQuestion,
): DecisionModelRequestQuestion {
  switch (question.type) {
    case DecisionModelQuestionType.CHOICE:
      return {
        type: "choice",
        instructions: question.instructions,
        criteria: Object.fromEntries(
          question.options.map((option) => [
            option.value,
            option.description ?? null,
          ]),
        ),
      };
    case DecisionModelQuestionType.SCORE:
      return {
        type: "score",
        instructions: question.instructions,
        criteria: question.levels.map((level) => level.description),
      };
    case DecisionModelQuestionType.NOUL:
      return {
        type: "boolean",
        instructions: question.instructions,
        ...(question.criteria
          ? {
              criteria: {
                true: question.criteria.true ?? null,
                false: question.criteria.false ?? null,
              },
            }
          : {}),
      };
  }
}

export function buildDecisionModelRequest(params: {
  variables: ExtractedVariable[];
  questions: DecisionModelQuestions;
}): DecisionModelRequest {
  const state = buildDecisionModelState(params.variables);
  if (Object.keys(state).length === 0) {
    throw new DecisionModelEvaluatorError(
      "Decision-model state is empty: none of the mapped fields exist on this observation",
    );
  }
  return {
    state,
    questions: Object.fromEntries(
      params.questions.map((question) => [
        question.id,
        toDecisionModelRequestQuestion(question),
      ]),
    ),
  };
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

function rankedEntries(probabilities: Record<string, number>) {
  return Object.entries(probabilities).sort(([, a], [, b]) => b - a);
}

/**
 * Decision models return no rationale, so the comment carries the numbers a
 * reviewer needs to judge the verdict from the trace view.
 */
export function formatDecisionModelComment(params: {
  question: DecisionModelQuestion;
  answer: DecisionModelAnswer;
  model: string;
}): string {
  const { question, answer, model } = params;
  const parts: string[] = [];
  if (answer.type === "choice") {
    const winner = answer.probabilities[answer.choice];
    parts.push(
      winner === undefined
        ? answer.choice
        : `${answer.choice} (p=${formatNumber(winner)})`,
    );
    if (answer.confidence !== null) {
      parts.push(`confidence ${formatNumber(answer.confidence)}`);
    }
    const runnerUp = rankedEntries(answer.probabilities).find(
      ([option]) => option !== answer.choice,
    );
    if (runnerUp) {
      parts.push(`runner-up ${runnerUp[0]} (${formatNumber(runnerUp[1])})`);
    }
  } else if (answer.type === "score") {
    const nearestLevel = Math.min(
      Math.max(Math.round(answer.score), 0),
      question.type === DecisionModelQuestionType.SCORE
        ? question.levels.length - 1
        : 0,
    );
    const levelDescription =
      question.type === DecisionModelQuestionType.SCORE
        ? question.levels[nearestLevel]?.description
        : undefined;
    parts.push(
      typeof levelDescription === "string"
        ? `${formatNumber(answer.score)} ≈ level ${nearestLevel} "${levelDescription}"`
        : `${formatNumber(answer.score)} ≈ level ${nearestLevel}`,
    );
    if (answer.confidence !== null) {
      parts.push(`confidence ${formatNumber(answer.confidence)}`);
    }
  } else {
    parts.push(`P(true)=${formatNumber(answer.probability)}`);
  }
  parts.push(model);
  return parts.join(" · ");
}

/**
 * Everything the provider returned beyond the score value, namespaced under
 * `typesafe` so users can read it the same way on every decision-model score.
 */
function toScoreMetadata(params: {
  question: DecisionModelQuestion;
  answer: DecisionModelAnswer;
  model: string;
}): Record<string, unknown> {
  const { question, answer, model } = params;
  const base = { questionId: question.id, type: question.type, model };
  switch (answer.type) {
    case "choice":
      return {
        typesafe: {
          ...base,
          choice: answer.choice,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
        },
      };
    case "score":
      return {
        typesafe: {
          ...base,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
          legend:
            question.type === DecisionModelQuestionType.SCORE
              ? Object.fromEntries(
                  question.levels.map((level, index) => [
                    String(index),
                    level.description,
                  ]),
                )
              : undefined,
        },
      };
    case "boolean":
      return { typesafe: base };
  }
}

function expectedAnswerType(
  question: DecisionModelQuestion,
): DecisionModelAnswer["type"] {
  return question.type === DecisionModelQuestionType.NOUL
    ? "boolean"
    : question.type;
}

/**
 * Maps every answer to the score its question declares. Choice → categorical
 * label; score → numeric expected level; noul → numeric P(true). Certainty
 * never changes the value: probabilities and confidence go into metadata.
 */
export function mapDecisionModelAnswersToScores(params: {
  questions: DecisionModelQuestions;
  evaluation: DecisionModelEvaluation;
}): CodeEvalScoreWithName[] {
  const { questions, evaluation } = params;

  return questions.map((question) => {
    const answer = evaluation.answers[question.id];
    if (!answer) {
      throw new DecisionModelEvaluatorError(
        `Decision model returned no answer for question "${question.scoreName}"`,
      );
    }
    if (answer.type !== expectedAnswerType(question)) {
      throw new DecisionModelEvaluatorError(
        `Decision model returned a ${answer.type} answer for the ${question.type} question "${question.scoreName}"`,
      );
    }

    const common = {
      name: question.scoreName,
      comment: formatDecisionModelComment({
        question,
        answer,
        model: evaluation.model,
      }),
      metadata: toScoreMetadata({ question, answer, model: evaluation.model }),
    };

    switch (answer.type) {
      case "choice": {
        if (
          question.type !== DecisionModelQuestionType.CHOICE ||
          !question.options.some((option) => option.value === answer.choice)
        ) {
          throw new DecisionModelEvaluatorError(
            `Decision model returned "${answer.choice}", which is not an option of question "${question.scoreName}"`,
          );
        }
        return {
          ...common,
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          value: answer.choice,
        };
      }
      case "score":
        return {
          ...common,
          dataType: ScoreDataTypeEnum.NUMERIC,
          value: answer.score,
        };
      case "boolean":
        return {
          ...common,
          dataType: ScoreDataTypeEnum.NUMERIC,
          value: answer.probability,
        };
    }
  });
}

export async function executeDecisionModelEvaluator(params: {
  variables: ExtractedVariable[];
  questions: DecisionModelQuestions;
  client: DecisionModelClient;
}) {
  const request = buildDecisionModelRequest(params);
  const evaluation = await params.client.evaluate(request);
  const scores = mapDecisionModelAnswersToScores({
    questions: params.questions,
    evaluation,
  });
  return { request, evaluation, scores };
}

/**
 * One-span execution trace so the "view execution trace" link on every score
 * of the run shows exactly what was sent and what came back.
 */
export function buildDecisionModelTraceInput(params: {
  projectId: string;
  executionTraceId: string;
  traceStartTime: Date;
  traceName: string;
  request: DecisionModelRequest;
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
    input: stringifyValue(params.request),
    output: stringifyValue(params.evaluation.answers),
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
