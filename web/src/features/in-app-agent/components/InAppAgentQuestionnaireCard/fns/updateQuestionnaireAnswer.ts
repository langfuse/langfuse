import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { assertUnreachable } from "@/src/utils/types";
import type { QuestionnaireFormAnswer } from "./createQuestionnaireFormValues";

type QuestionnaireAnswerAction =
  | { type: "toggleOption"; optionIndex: number }
  | { type: "setOtherText"; otherText: string };

/**
 * Single-choice questions hold one answer at a time, so choosing an option
 * clears the custom answer and typing a custom answer clears the chosen option.
 */
export function updateQuestionnaireAnswer(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  action: QuestionnaireAnswerAction,
): QuestionnaireFormAnswer {
  if (action.type === "toggleOption") {
    return toggleOption(answer, question, action.optionIndex);
  }
  if (action.type === "setOtherText") {
    return setOtherText(answer, question, action.otherText);
  }

  return assertUnreachable(action);
}

function toggleOption(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  optionIndex: number,
): QuestionnaireFormAnswer {
  const isSelected = answer.selectedOptionIndexes.includes(optionIndex);

  if (!question.allowMultiple) {
    return {
      selectedOptionIndexes: isSelected ? [] : [optionIndex],
      otherText: "",
    };
  }

  return {
    ...answer,
    selectedOptionIndexes: isSelected
      ? answer.selectedOptionIndexes.filter((index) => index !== optionIndex)
      : [...answer.selectedOptionIndexes, optionIndex],
  };
}

function setOtherText(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  otherText: string,
): QuestionnaireFormAnswer {
  const clearsSelection =
    !question.allowMultiple && otherText.trim().length > 0;

  return {
    selectedOptionIndexes: clearsSelection ? [] : answer.selectedOptionIndexes,
    otherText,
  };
}
