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
      confidence: number | null;
    }
  | {
      type: "score";
      score: number;
      probabilities: Record<string, number>;
      confidence: number | null;
    }
  | {
      type: "boolean";
      probability: number;
    };

export type DecisionModelEvaluation = {
  model: string;
  answers: Record<string, DecisionModelAnswer>;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
};

export type DecisionModelClient = {
  evaluate: (request: DecisionModelRequest) => Promise<DecisionModelEvaluation>;
};

export class DecisionModelEvaluatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionModelEvaluatorError";
  }
}

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

export function formatDecisionModelComment(params: {
  question: DecisionModelQuestion;
  answer: DecisionModelAnswer;
}): string {
  const { question, answer } = params;
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
  return parts.join("; ");
}

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
      comment: formatDecisionModelComment({ question, answer }),
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
