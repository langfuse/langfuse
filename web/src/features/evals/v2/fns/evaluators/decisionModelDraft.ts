import {
  DecisionModelQuestionType,
  ScoreDataTypeEnum,
  type DecisionModelQuestions,
  type ObservationVariableMapping,
} from "@langfuse/shared";

import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";

/**
 * Bridge between the current single-question setup form and the
 * multi-question decision-model definition. The form authors one choice
 * question over a fixed `input`/`output` state; the full question and state
 * editors replace this bridge.
 */

export const DECISION_MODEL_DRAFT_QUESTION_ID = "verdict";

export const DECISION_MODEL_DRAFT_STATE_MAPPING: ObservationVariableMapping[] =
  [
    {
      templateVariable: "input",
      selectedColumnId: "input",
      jsonSelector: null,
    },
    {
      templateVariable: "output",
      selectedColumnId: "output",
      jsonSelector: null,
    },
  ];

export function buildDecisionModelDraftQuestions(params: {
  instructions: string;
  scoreName: string;
  scoreOutput: ScoreOutputFormState;
}): DecisionModelQuestions | null {
  const instructions = params.instructions.trim();
  const scoreName = params.scoreName.trim();
  const options = params.scoreOutput.choices
    .map(({ label }) => label.trim())
    .filter(Boolean);
  if (
    !instructions ||
    !scoreName ||
    params.scoreOutput.dataType !== ScoreDataTypeEnum.CATEGORICAL ||
    options.length < 2 ||
    new Set(options).size !== options.length
  ) {
    return null;
  }
  return [
    {
      id: DECISION_MODEL_DRAFT_QUESTION_ID,
      scoreName,
      type: DecisionModelQuestionType.CHOICE,
      instructions,
      options: options.map((value) => ({ value })),
    },
  ];
}

/** Reads the first question back into the single-question form state. */
export function decisionModelQuestionsToDraft(
  questions: unknown,
): { instructions: string; scoreOutput: ScoreOutputFormState } | null {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const question = questions[0] as {
    type?: string;
    instructions?: unknown;
    options?: Array<{ value: string }>;
  };
  if (question.type !== DecisionModelQuestionType.CHOICE) return null;
  return {
    instructions:
      typeof question.instructions === "string"
        ? question.instructions
        : JSON.stringify(question.instructions ?? ""),
    scoreOutput: {
      dataType: ScoreDataTypeEnum.CATEGORICAL,
      scoreDescription: "",
      reasoningDescription: "",
      choices: (question.options ?? []).map(({ value }) => ({ label: value })),
      shouldAllowMultipleMatches: false,
      minValue: "",
      maxValue: "",
    },
  };
}
